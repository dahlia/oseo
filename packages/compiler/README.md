@oseo/compiler
==============

This package owns Oseo syntax, hint metadata, lexical resolution, HIR, MIR,
specialization policy, diagnostics, targets, and extension interfaces.
Concrete parser, backend, runtime, toolchain, and host packages implement these
contracts without becoming compiler-core dependencies.
The exported syntax contract separates declaration binding patterns from
destructuring assignment patterns. Only assignment patterns admit member
targets, and lexical resolution validates that context independently of binding
write mode. Binding-identifier leaves retain their own hint metadata so a
frontend can attach name-based parameter hints without annotating an aggregate
ABI parameter. The Babel frontend also maps primitive members from inline
object, tuple, and array TypeScript annotations to those leaves without making
compiler core depend on TypeScript syntax or type resolution.

Internal ownership follows the compiler pipeline. *source.ts* and *syntax.ts*
define frontend-neutral inputs. *modules.ts* owns graph construction and
linking. The _hir-\*.ts_ and _mir-\*.ts_ families separate representations,
construction, printing, and guarded specialization. *module-compile.ts* owns
whole-graph asynchronous compilation, while *compile.ts* composes source
compilation. *native.ts* contains replaceable backend, runtime, toolchain,
process, target, and host contracts. *index.ts* is the unchanged public export
and composition surface. Package-private modules are not package export paths.

Native target descriptions contain immutable artifact facts, including the
architecture, operating system, ABI, executable format, C standard,
sanitizer policy, and the processor hint that `Atomics.pause` executes. Stable
Oseo target IDs use operating-system, architecture, and optional ABI order.
Concrete toolchain spellings do not enter the compiler core. Execution-host
descriptions are separate capabilities. `targetForExecutionHost` selects the
one supported target for a normalized host, while `canExecuteTarget` rejects
mismatched pairs before process execution.

MIR is self-contained: constants, lexical binding reads and writes, MIR-owned
parameters, rest markers, and hints, operators, call targets, control-flow
blocks, and terminators do not retain HIR nodes. M3 bindings use shared mutable
cells in traced environments, so escaped closures retain binding identity. MIR
also owns dynamic calls, receiver and constructor operations, ordinary
properties, arrays, and explicit completion state for `catch` and `finally`.
Binding reads retain runtime temporal-dead-zone checks, and every collecting
operation has an explicit safepoint.
Synchronous `for-of` adds backend-neutral iterator get, next, and close
operations with separately rooted results. Cleanup-depth targets distinguish
same-loop continuation from transfers that must close the iterator.
Array literal spread reuses iterator get and next while accumulating values and
holes through dedicated MIR operations. Iterator acquisition and stepping
failures return directly without `IteratorClose`, matching array accumulation
semantics. Arrays without spread retain their fixed-length lowering.
Call and constructor argument spread accumulate ordinary and iterated values in
a rooted private argument list after evaluating the target. Abrupt iterator
work returns without `IteratorClose`; invocations without spread retain fixed
positional lowering. Construction allocates its receiver after accumulation. A
spread before a later top-level await point keeps the list in the module
evaluator's traced asynchronous frame.
A `const` or `let` declaration list arrives as one owned `declaration-list`
statement, and HIR construction expands its declarators into the statement
list that contains the declaration. ECMAScript gives those declarators the
scope that contains them, so the existing per-scope predeclaration pass gives
the whole list one temporal dead zone, one duplicate-name check, and one set
of cells. A block would instead declare a scope the source does not have and
reset the same cells a second time. A declaration list that reaches a
single-statement position is a source-located diagnostic, because the grammar
admits a lexical declaration only where a StatementList is admitted.
Standalone array binding declarations use compiler-owned recursive
patterns rather than frontend AST nodes. MIR gives each pattern an explicit
iterator done state and steps elisions and elements in order. It drains rest
into a rooted array and enters conditional close blocks for abrupt or early
normal completion. Nested patterns compose those cleanup regions from the
inside out. Lexical leaves initialize predeclared cells, while hoisted `var`
leaves use checked writes to existing function-scope cells.
Object binding declarations share those recursive leaves. MIR checks
`RequireObjectCoercible` before evaluating a computed property name and
converts each key through `ToPropertyKey`. It reads properties from left to
right and applies defaults only to `undefined`. It enters nested array or
object patterns without recovering frontend syntax.
Catch parameters reuse those patterns after capturing the pending thrown value.
MIR resets every catch cell before initialization, retains conditional iterator
cleanup, and sends a pattern failure through the enclosing `finally` or abrupt
target without entering the catch body. A handler without a parameter still
consumes the pending completion to clear the error context, then discards the
thrown value and binds nothing.
Synchronous `for-of` declaration heads reuse the same patterns. MIR resets all
lexical leaves before iterator acquisition and before each iteration, while
`var` leaves write hoisted cells. Nested pattern cleanup resumes through the
outer iterator close block after a pattern failure.
Classic `for` declaration heads also reuse the recursive patterns. Every
lexical leaf enters its temporal dead zone before its initializer, and each
mutable `let` leaf moves into a fresh per-iteration cell before the loop update.
`const` leaves retain their single environment, while `var` leaves write the
existing hoisted cells.
Assignment-pattern heads reuse the existing-target path without creating
cells. Their identifier and member leaves run after each outer iterator step,
and a failure resumes through nested pattern cleanup before that outer close.
Destructuring assignment evaluates its right operand once, then sends the same
recursive patterns through checked writes to existing identifier cells or
owned member references. Member object and key expressions lower before the
corresponding iterator step, source read, or default; key conversion and
storage lower after value selection. A nullish member base fails before key
conversion and resumes through active nested and outer iterator cleanup. The
expression retains the original right-hand value, nested array cleanup stays
inside out, and imported and immutable leaves keep their ordinary errors.
Inside an ordinary asynchronous or asynchronous generator body, a member
object, a computed property name, and a default may each suspend at `await`,
because the pattern lowers into the body's traced frame and every value it has
already prepared lives in that frame's root slots. A module evaluator with
top-level await is such an asynchronous body, so module top level accepts the
same positions.
Compound assignment retains one identifier read or one member object,
property-key expression, converted key, and property read before evaluating its
right operand. The retained raw key value is converted again on the write path
after the right operand. Binary forms reuse the corresponding MIR operator
before a checked write. Logical forms lower through explicit branches, so the
skipped path performs no right evaluation, second key conversion, or write.
Inside an asynchronous body, including a module evaluator, an `await` in the
right operand suspends with the retained current value in the traced frame.
Update expressions retain a binding reference or one member object and raw key
value. They apply numeric coercion and arithmetic by one before a checked
write. Member steps convert the raw key independently for the read and write.
Prefix forms return the assigned value, while postfix forms keep the coerced
previous value rooted across the write. A nullish base fails before either key
conversion. The path reuses existing MIR operations. The module continuation
extractor can rebuild a member step around an admitted await in its object or
key expression.
Non-strict duplicate parameters share one binding while retaining every
argument position. Repeated declarations resolve to one function binding whose
body comes from the last declaration. Named function expressions retain a
private self binding.

M4 adds owned module syntax, canonical graph discovery interfaces, static
linking, strongly connected components, and whole-graph lowering. Imported and
exported names share one traced cell identity, and namespace creation retains
sorted live-cell mappings. MIR call targets also name promise operations,
timers, and the `module-evaluate` driver entry without importing a concrete
runtime or event loop into compiler core. A module graph's script instantiates
every environment, then passes the module table to `module-evaluate`: the
entry index, the module count, and per module its evaluator, a top-level await
flag, and its requested module indices in source order. The runtime driver owns
every evaluation state field, so the build no longer fixes evaluation order.
Function creation retains ordinary, arrow, asynchronous, and asynchronous-arrow
identity through HIR and MIR.

Graph discovery also follows the literal `import()` sites that a frontend
reports in `importCalls`. Each target's static closure joins the graph after
the entry's static closure, but never a module's `dependencies`, so linking
covers it while the startup evaluation order does not. `buildModuleGraph` and
`buildScriptRequests` retain one `ModuleRequestRecord` per resolved request,
with its referrer, location, decoded literal, canonical target, and
`evaluation` or `discovery` edge kind, in a deterministic order. A Script
referrer resolves against an explicit canonical identity and is never a module
record. A failure reached through an `import()` edge carries its importer
chain in the diagnostic notes. `compileModuleGraph` and HIR construction still
reject every `import()` with the profile diagnostic.

`compileSource` and `buildMir` accept an explicit enabled or disabled
specialization policy. Enabled mode selects the M2 checked small-integer path
only for the reviewed two-parameter return form. Its MIR retains hint
provenance, two tag guards, checked arithmetic, a shared generic fallback, and
an explicit result join. Disabled mode emits the unchanged generic graph.
