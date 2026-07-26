M5 plan for measured ECMAScript compatibility
=============================================

Status
------

Implementation status: active. M4 established closed native module graphs,
live bindings, promises, asynchronous continuations, top-level await, and a
deterministic native scheduler. M5 expands that documented subset through
measured compatibility work rather than treating ECMAScript as one feature.

The first four delivery items are complete.
[ADR 0013](./docs/adr/0013-m5-edition-and-manifest.md) freezes the candidate
edition, optional-section policy, and manifest schema, and
[*docs/language-profile-m5.md*](./docs/language-profile-m5.md) is the living
M5 profile. The test262 harness executes module and asynchronous cases under
the deterministic native scheduler through the explicit CLI module goal, and
the dependency-indexed baseline manifest covers module linking and early
errors, top-level await, asynchronous functions, and the Promise family with
honest unsupported classifications. The current reviewed manifest records 639
passes, 254 expected negatives, and 126 unsupported profile features with no
semantic or harness failures.
[ADR 0020](./docs/adr/0020-m5-applicable-test-inventory.md) now fixes the
M5a denominator at 41,091 paths from 47,381 candidates: 22,998 language tests
and 18,093 built-in tests are inside the 16th edition, while 6,290 proposal,
post-edition, or Annex B paths are outside it. The compact inventory remains
separate from the result manifest.

Delivery item 8 is resolved for dynamic source:
[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md) keeps `eval`, the
`Function` constructor, and dynamic import explicitly unsupported with owned
diagnostics and the `dynamic-source` manifest tag.
[*PLAN-DYN.md*](./PLAN-DYN.md) records the deferred capability and evidence
track without reopening the M5 decision. Realms, agents, and shared memory
remain classified through missing harness capabilities.
Delivery item 5 is substantially in progress. The admitted syntax now
covers every scalar operator family (`typeof`, `void`, `%`, `**`,
bitwise and shift operators, unary `+` and `~`, `&&`, `||`, `??`, the
conditional and comma operators, loose equality, `in`, and
`instanceof`), `var` declarations with function-scope hoisting,
synchronous arrow functions, untagged template literals, and the
control-flow statements `do-while`, classic `for` with per-iteration
lexical environments, `switch`, and labeled statements, each with
native differential, structural, and reviewed test262 evidence
recorded in [*docs/language-profile-m5.md*](./docs/language-profile-m5.md).
The named error intrinsics, the first intrinsics-and-built-ins unit,
are implemented: `Error` and the six NativeError constructors are
runtime-owned values, runtime semantic errors are typed catchable
instances, and the test262 runner executes runtime negatives against
the rendered error identity. Generic `ToPrimitive` is implemented as
one shared runtime conversion behind every coercing operator,
template substitutions, property keys, error messages, and timer
delays, with `@@toPrimitive` dispatch deferred to the symbols unit.
Symbol values, the `Symbol` intrinsic, symbol property keys, and the
well-known symbols are implemented, with `Symbol.toPrimitive`
dispatched by the generic conversion. The synchronous iterator
protocol is implemented as an owned runtime surface with a first-class
array iterator, and `Promise.all` and `Promise.race` consume any
object iterable through it, closing the iterator when a combinator
rejects after a step, completing the delivery item 5 groundwork; the
`for-of` statement now consumes the same object-iterator protocol with
lexical, assignment, and cleanup semantics. Array literal spread now consumes
that protocol through dynamic own-property accumulation, preserving holes,
captured `next` methods, and the specified absence of `IteratorClose` on
acquisition or step failures. Call and constructor spread use a rooted dynamic
argument list. Standalone array binding declarations now admit `const`, `let`,
and hoisted `var` with
elisions, defaults, nested array patterns, and rest through the same iterator
protocol, with conditional `IteratorClose` and direct awaited initialization.
Standalone object binding declarations now admit `const`, `let`, and hoisted
`var` with static, computed, shorthand, renamed, defaulted, and nested object or
array properties and a final identifier rest target. They preserve nullish
checks, property-key and default order, direct awaited initialization, ordered
enumerable own-key copying, and string and symbol exclusions. Catch parameter
destructuring is now implemented: catch clauses admit the same
recursive array and object patterns, including defaults and rest, with fresh
catch cells, iterator cleanup, and abrupt propagation through `finally`.
Synchronous `for-of` declaration heads now admit those recursive patterns for
`const`, `let`, and `var`, preserving lexical temporal dead zones, fresh
per-iteration cells, `var` hoisting, nested cleanup, and outer iterator close
on pattern failure. Its non-declaration heads also admit recursive array and
object assignment patterns with existing identifier or member leaves.
Standalone destructuring assignment now admits
recursive array and object patterns whose leaves and rest targets are existing
identifiers or member references. It evaluates the right operand once, returns
that original value, preserves default and rest behavior, conditionally closes
array iterators, and retains immutable and imported binding errors. Member
object and key expressions run before iterator steps, source reads, and
defaults, while key conversion and storage remain after value selection.
Compound assignment now admits every arithmetic, exponentiation, bitwise,
shift, and logical assignment operator for identifiers and member references.
The target reference and current value are evaluated once, logical assignments
skip both the right operand and write on their short branch, and checked writes
retain immutable and imported binding errors. This unit promotes the 42
reviewed `for-of` binding cases whose loop bodies use `+=`.
Prefix and postfix `++` and `--` now admit identifier and member references.
They coerce the previous value through the admitted Number path, preserve the
distinct prefix and postfix results, and reuse checked writes. Member targets
evaluate their object and key expressions once, then perform the observable
read and write key conversions in order. Four new passing test262 cases cover
the four forms, and the admitted classic `for` update promotes one existing
exponentiation case to pass.
Classic `for` declaration heads now accept recursive array and object patterns
for `const`, `let`, and `var`. Lexical leaves preserve temporal dead zones,
mutable `let` leaves receive fresh per-iteration cells, and `var` leaves write
their hoisted cells. Generated evidence uses seed `0x5eed0010` across both
pattern families, defaults, rest, nullish inputs, all three declaration kinds,
both specialization policies, and forced collection. Seven reviewed test262
cases pin the admitted paths.
Synchronous functions, constructors, and arrows now accept recursive array and
object binding-pattern parameters. Parameter initialization runs in source
order in an environment outside the function body, so later parameters retain
their temporal dead zones and body declarations do not leak into defaults.
Generated evidence uses seed `0x5eed0011` across both pattern families,
present, missing, and nullish inputs, absent, truthful, and false JSDoc hints,
both specialization policies, and forced collection. Name-based JSDoc hints
attach to the pattern binding they describe rather than the hidden aggregate
ABI parameter. Four reviewed test262 cases pin array values, defaults, nesting,
rest, and abrupt completion. Synchronous top-level default parameters now use
the same separate parameter environment and preserve hints on identifier
parameters. HIR and MIR retain JavaScript function length independently from
the ABI parameter count. Generated evidence uses seed `0x5eed0012` across
supplied and missing bounded integer values, both specialization policies, and
forced collection. Fixed evidence covers explicit `undefined`, null, prior and
later references, body isolation, abrupt initializers, constructors, arrows,
function-name inference, and function length. Five reviewed test262 cases pin
fallback selection, prior references, and length. Synchronous top-level rest
parameters collect the unbound argument suffix into a fresh array without
changing the generic call ABI. Generated evidence uses seed `0x5eed0013`
across zero to three fixed parameters, bounded argument lists, both
specialization policies, and forced collection. Fixed evidence covers empty
and nonempty suffixes, heap-valued arguments, fresh identity, arrows,
constructors, array and object binding patterns, and function length. Six
reviewed test262 cases pin syntax, patterns, collection, and length.
Body `var` declarations may now share parameter names. When the parameter list
contains an expression, the frontend initializes each matching body cell from
an outer parameter copy so closures created by parameter initializers retain
the parameter cell. Lists without parameter expressions, including rest-only
lists, continue to reuse the parameter cell. When a top-level body function
declaration and `var` share that name, the function declaration owns the body
binding and no parameter-copy binding is synthesized. Generated evidence uses
seed
`0x5eed0014` across default, array-pattern, object-pattern, and plain sibling
bindings, `var`-owned and function-owned body cells, both specialization
policies, and forced collection. Fixed evidence also covers arrows and
rest-only lists. Six reviewed test262 cases pin the separate parameter and body
environments.
Asynchronous functions and arrows run default and binding-pattern
initialization inside the owned asynchronous executor. Rest collection retains
the ordinary call ABI, and abrupt initializers reject the returned promise
without entering the body or throwing synchronously. The generated
binding-pattern property now varies synchronous and asynchronous functions,
plus absent, truthful, and false JSDoc or TypeScript hints. Inline object,
tuple, and array annotations map syntactically visible primitive member types
to the binding leaves they describe without invoking a TypeScript type checker.
Fixed native evidence covers defaults, patterns, rest, same-name body `var`,
and abrupt rejection. Six reviewed test262 cases pin default selection, prior
references, and rejection. The same structural annotation mapping now covers
standalone declarations and classic `for` declaration heads. Optional members
remain unhinted. Array element types continue through unambiguous nested array
rest targets. Direct fixed-length tuple spreads expand before mapping, so their
members and following suffix retain their syntactic positions. Expanded members
follow the ordinary primitive-hint and unsupported-type rules. Variadic array
rests and type-reference spreads remain unhinted where their length makes a
position ambiguous. Object targets inside an array rest remain unhinted.
Computed object properties also remain unhinted even when their key is a
literal. When an inline annotation's container shape disagrees with a nested
array or object binding subtree, that subtree remains unhinted without a
diagnostic and sibling mappings continue. Root container mismatches and type
annotations that require resolution remain explicit boundaries. Awaited member
targets remain later work. The runtime component
boundaries recorded in
[*docs/runtime-components.md*](./docs/runtime-components.md) are implemented,
so that work is no longer blocked on them. Delivery items 6, 7, 9, and 10
remain open.

Before the next broad M5 syntax and built-in batches, the compiler, Babel
frontend adapter, and native fixture runner were decomposed into
responsibility-owned modules. [*DESIGN.md*](./DESIGN.md) and the compiler and
Babel adapter package README files record the durable ownership. The completed
refactoring preserves the current profile and compatibility counts; it does not
complete an M5 semantic unit by itself.

Basic object literal expressions are now admitted: data properties, shorthand
properties, and method definitions allocate a fresh ordinary object and add
each property in source order through the generic object allocation and
property write paths already built for object rest destructuring. Each
property value evaluates left to right, and its storage growth is a declared
MIR safepoint. Method definitions reuse the existing anonymous-function name
inference so a method's name matches its key, and its dynamic `this` binds the
call-site receiver like any ordinary function. A new runtime function kind
keeps a method non-constructible and without an own `prototype` property,
distinct from the constructible functions created by function declarations
and function expressions; arrow functions remain non-constructible and
prototype-less for the separate reason that they already bind lexical
`this`. Computed property keys were already admitted by prior work. Getter and
setter accessors are now admitted: each accessor evaluates its key and
installs a runtime accessor property that dispatches through the property
lookup and assignment paths already built for other property kinds. An
accessor property is always configurable and enumerable, and a later
accessor or data property for the same key replaces an earlier one in
source order, matching the existing last-definition-wins rule for data
properties. Object spread properties are now admitted as well: a spread
copies every own enumerable property of its source, including symbol keys,
into the object under construction as a writable, enumerable, configurable
data property, in the source's own-key order and at the spread's position
in source order. A getter on the source is invoked once and its result
stored as data. A nullish source copies nothing rather than throwing,
unlike an object binding rest, and a non-nullish primitive source copies
the own enumerable properties its wrapper exposes, so a string source
contributes its index properties and every other primitive contributes
none. The runtime shares one `CopyDataProperties` helper between object
binding rest, which copies into a fresh object with excluded keys, and
object spread, which copies into the literal's object with no excluded
keys. The Annex B `__proto__` property-name special case remains rejected
with a source-located diagnostic in every syntactic form, including
shorthand and method keys, and a spread preceding a later top-level await
point is rejected for the same evaluation-order reason as array, call, and
constructor spread. The generated property suite uses seed `0x5eed0015`
across zero to four data, shorthand, method, getter, setter, object spread,
and nullish spread properties over a shared five-name key pool and bounded
integer values, comparing an independent key-order, last-definition, and
evaluation-order model with Node.js, Deno, and both native specialization
policies with forced collection on the enabled path. Fixed native fixtures
retain the empty object, single and multiple data properties, shorthand
from a local binding and from a parameter, a method's `this` reference and
non-constructible identity, getter-only and setter-only accessors, an
accessor pair's shared descriptor, nested object literals, left-to-right
evaluation order, abrupt completion in a property value, and forced
collection across property safepoints, and add empty, plain, getter-backed,
interleaved, overwriting, integer-key, nullish, primitive, array,
function, prototype-chain, non-enumerable, and symbol-keyed spread sources
plus an abrupt spread source and a spread-driven growth loop. Three hundred
thirty-eight reviewed test262 cases newly pass, twenty-four of them object
spread cases covering identifier, null, undefined, multiple, getter
descriptor, getter initialization, immutable override, and
previous-property override sources.

V8 enumerates an accessor defined after an object literal spread property
last instead of in property-creation order, so Node.js and Deno cannot act
as references for that one combination. The generated suite rewrites such
an accessor as a data property, and the fixed
*tests/fixtures/object-spread-accessor-order.js* native scenario asserts
the ECMA-262 order directly without a reference observation, alongside the
accessor-before-spread order both references do agree with.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*PLAN-DYN.md*](./PLAN-DYN.md), [*PLAN-NIO.md*](./PLAN-NIO.md),
[*PLAN-GC.md*](./PLAN-GC.md), [*PLAN-PT.md*](./PLAN-PT.md),
[*PLAN-REGEXP.md*](./PLAN-REGEXP.md), [*PLAN-GATE.md*](./PLAN-GATE.md), the
frozen language profiles, and
accepted records under *docs/adr/*. The reviewed evidence gate cost that every
semantic unit pays is owned by [*PLAN-GATE.md*](./PLAN-GATE.md) and measured in
[*docs/gate-cost-baseline.md*](./docs/gate-cost-baseline.md). The completed
runtime componentization recorded in
[*docs/runtime-components.md*](./docs/runtime-components.md) provides the
component boundaries that large intrinsic tables and built-in families build
on. Evidence that changes one of these contracts updates the affected document
in the same change.


Goal
----

M5 broadens Oseo from the M4 subset toward a substantiated ECMA-262 conformance
claim for a named edition. Every intermediate release publishes an exact
capability and test manifest. It does not use the conformance label while known
language gaps remain inside the claimed edition and host profile.

Compatibility work proceeds in dependency order. Generic semantics, collector
ownership, abrupt completion, and source-located diagnostics land before an
optimization or a larger syntax family depends on them. A feature is complete
only when its source form, runtime semantics, negative cases, standards
evidence, generated domain, and native target evidence agree.


Entry evidence
--------------

M5 begins with these repeatable contracts:

 -  parser-owned nodes do not cross the frontend boundary;
 -  syntax, HIR, MIR, C lowering, runtime, hosts, and the toolchain remain
    separate package boundaries;
 -  generic primitive, object, array, property, closure, exception, module,
    promise, and scheduling semantics execute without a bootstrap runtime;
 -  specialization can be disabled, and every current guard retains one
    compiled generic fallback;
 -  collector roots cover environments, cells, namespaces, promises,
    continuations, jobs, timers, and thrown values;
 -  the test262 adapter records revision, metadata, strictness, phase, and
    honest unsupported classifications;
 -  deterministic property suites retain seeds, replay paths, structured
    inputs, and incomplete-run failures;
 -  Node.js, Deno, Linux AMD64 native execution, macOS AArch64 native
    execution, and AArch64 Linux compile-link evidence remains in ordinary
    repository gates; and
 -  strict C warnings, undefined-behavior sanitization, package dry runs, and
    version checks remain green.


Measurement contract
--------------------

The checked-in compatibility manifest is the source of truth for M5 progress.
Each result records the exact test262 revision, path, frontmatter, strictness
mode, harness includes, requested phase, actual phase, target, specialization
policy, and observation. Module and asynchronous cases additionally record
their graph and scheduler mode.

Results remain classified as pass, semantic failure, expected negative,
unsupported profile feature, or harness failure. Unsupported and harness
results never increase the pass count. A newly supported feature moves tests
from unsupported only after every applicable variant executes. A changed
upstream revision is a reviewed manifest change, not an automatic percentage
update.

Coverage reports group results by syntax, abstract operation, intrinsic,
built-in object, module behavior, and asynchronous behavior. Raw totals remain
available so a large group cannot hide a regression in a smaller dependency.
Known gaps link to the profile section, implementation issue, or architecture
decision that owns them.


Edition and profile boundary
----------------------------

[ADR 0013](./docs/adr/0013-m5-edition-and-manifest.md) records the candidate
ECMA-262 edition and the exact normative and optional sections included in
the eventual claim. Annex B, internationalization, host hooks, realms,
agents, shared memory, and embedding APIs are classified explicitly rather
than being silently included or omitted.

M5 releases describe tested capabilities without using the conformance label
while known gaps remain inside that boundary. The language profile grows
monotonically within a release line. Removing an admitted behavior requires
evidence, a migration note, and an updated compatibility manifest.


Semantic dependency streams
---------------------------

M5 uses several coordinated streams. They may overlap only when their generic
prerequisites are already complete.

### Core expressions and bindings

Complete the remaining coercions, operators, declarations, destructuring,
default values, rest and spread behavior, template literals, and control-flow
forms required by later built-ins. Preserve left-to-right evaluation and
abrupt-completion order before adding specialized paths.

Array literal spread is complete for object iterables. Its generated property
suite uses seed `0x5eed0005`, compares an independent accumulation model with
Node.js, Deno, and both native specialization policies, and forces collection
on the enabled path. Five reviewed test262 cases pin iterator acquisition and
step failures. Call argument spread now uses a rooted dynamic argument list and
preserves target-first, left-to-right evaluation without `IteratorClose` on
spread failures. Constructor argument spread shares the list while evaluating
its callee before arguments and allocating the receiver only after accumulation
succeeds. The generated property suite uses seed `0x5eed0006` across intrinsic,
method, and dynamic calls and ordinary construction, both native specialization
policies, and forced collection. Native fixtures also cover `Promise`
construction. Ten reviewed test262 cases pin iterator acquisition and step
failures across calls and construction.

Standalone `const`, `let`, and `var` array binding declarations now own
recursive parser-independent patterns. Their lowering evaluates the initializer
once, steps from left to right, applies defaults only to `undefined`, drains
rest elements, and closes a non-exhausted iterator on normal or abrupt pattern
completion. The generated property suite uses seed `0x5eed0007`, compares an
independent binding and cleanup model with Node.js, Deno, and both native
specialization policies, and forces collection on the enabled path. Fixed
native fixtures retain temporal dead zones, function-name inference, nested
close order, step failure, close-completion precedence, `var` hoisting,
redeclaration, and direct awaited writes. Reviewed test262 evidence completes
the same syntax unit: 24 passing cases cover `const`, `let`, and `var` values,
defaults for holes and exhausted iterators, function-name inference, nested
patterns, rest, and iterator done-state handling.

Standalone object binding declarations reuse the same recursive binding leaves
without iterator cleanup. They check `RequireObjectCoercible` before a computed
key, apply `ToPropertyKey` and `GetV` from left to right, select defaults only
for `undefined`, and compose nested object and array patterns. A final
identifier rest target snapshots own keys in ECMAScript order, excludes each
previously evaluated property key, reads the remaining enumerable own values
through the generic property path, and creates ordinary data properties on a
fresh object. The generated property suites use seeds `0x5eed0008` and
`0x5eed0009` across ordinary, primitive, and nullish inputs, static and
computed string and symbol exclusions, both native specialization policies, and
forced collection. Twenty-four reviewed test262 cases cover all three
declaration kinds, nullish coercibility, trailing shorthand properties,
function-name inference for function, arrow, and covered expressions, rest
exclusions, fresh data descriptors, and non-enumerable omission.

Catch parameters now reuse those recursive patterns and binding leaves. Every
catch binding is created uninitialized before the pending thrown value enters
`BindingInitialization`. Array patterns keep conditional `IteratorClose`,
object patterns keep nullish checks and ordered property reads, and a pattern
failure skips the catch body while propagating through the enclosing
`finally`. The generated property suite uses seed `0x5eed000a` across array
and object patterns, present, missing, and nullish inputs, defaults, rest, both
native specialization policies, and forced collection. Fixed native fixtures
retain fresh catch cells, function-name inference, iterator cleanup and
step-failure behavior, and `finally` execution after pattern failure. Sixteen
reviewed test262 cases cover array values, defaults, function-name inference,
nested rest, object nullish failure, trailing properties, and object rest
descriptors.

Synchronous `for-of` declaration heads now accept the same recursive patterns
for `const`, `let`, and `var`. Every lexical name enters its temporal dead zone
before the iterable expression and receives a fresh cell before each
`BindingInitialization`; `var` leaves write their existing hoisted cells.
Nested array patterns close from the inside out, and a default, target, or
object-coercibility failure closes the outer `for-of` iterator after any inner
cleanup. The generated property suite uses seed `0x5eed000b` across array and
object patterns, all three declaration kinds, present, missing, and nullish
inputs, both native specialization policies, and forced collection. Fixed
native fixtures retain closure cells, function-name inference, object rest,
`var` retention, and outer close after a pattern failure. Forty-eight reviewed
test262 cases now pin the binding paths across all three declaration kinds. Six
cover nullish object-pattern failure, while another 42 exercise their loop
bodies through compound assignment.

Classic `for` declaration heads now accept recursive array and object patterns
for `const`, `let`, and `var`. Initializers reuse the standalone declaration
semantics, including defaults, rest, nullish object failure, nested iterator
cleanup, and checked writes to hoisted `var` cells. Lexical names enter their
temporal dead zone before initialization. At the end of each iteration, every
mutable `let` leaf moves into a fresh cell before the update expression runs,
so closures capture one iteration, while `const` retains its single
environment.

The generated property suite uses seed `0x5eed0010` across both pattern
families, all three declaration kinds, present, missing, and nullish inputs,
both native specialization policies, and forced collection. Its independent
cell model distinguishes `const` values, per-iteration `let` closures, and the
shared final `var` cell. Fixed native fixtures retain temporal dead zones,
nullish object failure, conditional iterator close, array defaults, object
rest, closure identity, and post-loop `var` values. Seven reviewed test262
cases pin array defaults, trailing object patterns, and object rest across all
three declaration kinds.

Synchronous function, constructor, and arrow parameter lists now accept the
same recursive array and object binding patterns. The frontend retains plain
ABI parameters, then performs owned `BindingInitialization` in a separate
parameter environment before entering the function body. This preserves
left-to-right initialization, later-parameter temporal dead zones, conditional
iterator close, object coercibility, default and rest behavior, lexical arrow
receivers, and function `length`. The generated property suite uses seed
`0x5eed0011` across both pattern families, present, missing, and nullish inputs,
absent, truthful, and false JSDoc hints, both native specialization policies,
and forced collection. Name-based JSDoc hints remain on their pattern binding
through owned syntax and HIR, while the hidden aggregate ABI parameter remains
unhinted. Fixed native fixtures retain nested defaults and rest, arrows,
constructors, parameter temporal dead zones, iterator cleanup, and function
length. Four reviewed test262 cases pin array values, nesting, defaults, rest,
and abrupt completion.
Synchronous top-level default parameters use the same parameter environment
and retain JavaScript function length separately from the ABI parameter count.
The generated property suite uses seed `0x5eed0012` across supplied and missing
values, both specialization policies, and forced collection. Fixed evidence
retains explicit `undefined`, null, prior and later references, body isolation,
abrupt initializers, constructors, arrows, identifier hints, function-name
inference, and function length. Five reviewed test262 cases pin fallback
selection, prior references, and length. Synchronous top-level rest parameters
retain an explicit HIR and MIR marker, and the C backend copies every remaining
generic call argument into a fresh array. The generated property suite uses
seed `0x5eed0013` across zero to three fixed parameters, bounded argument
lists, both specialization policies, and forced collection. Fixed evidence
retains empty and nonempty suffixes, heap-valued arguments, fresh identity,
arrows, constructors, array and object patterns, and function length. Six
reviewed test262 cases pin syntax, patterns, collection, and length. Nine
asynchronous non-simple strict-body parse negatives remain expected negatives.
Body `var` declarations may share parameter names. A parameter list containing
an expression receives separate parameter and body cells, with the body cell
initialized from the completed parameter binding before body execution. This
keeps closures created by parameter initializers attached to the parameter
cell. Lists without parameter expressions reuse the parameter cell. A
same-name top-level function declaration owns the body binding when `var` also
redeclares it, without creating a second synthetic binding. The generated
property suite uses seed `0x5eed0014` across default, array-pattern,
object-pattern, and plain sibling bindings, `var`-owned and function-owned body
cells, both native specialization policies, and forced collection. Fixed
evidence adds arrows, rest-only lists, and the function-owned binding. Six
reviewed test262 cases pin the environment split. Inline object, tuple, and
array TypeScript annotations map their syntactically visible required primitive
member types to the corresponding binding leaves in parameters, standalone
declarations, and classic `for` declaration heads. Optional members remain
unhinted. Array element types continue through unambiguous nested array rest
targets. Direct fixed-length tuple spreads expand before mapping, so their
members and following suffix retain their syntactic positions. Expanded members
follow the ordinary primitive-hint and unsupported-type rules. Variadic array
rests and type-reference spreads remain unhinted where their length makes a
position ambiguous. Object targets inside an array rest remain unhinted.
Computed object properties remain unhinted even when their source key is a
literal. A nested array or object binding subtree remains unhinted when its
inline annotation has another container shape, without changing whether the
program compiles or suppressing hints on matching siblings. Root container
mismatches and type annotations that require resolution, including alias or
interface references, remain source-located unsupported boundaries.
Asynchronous functions and arrows create that parameter environment inside the
owned asynchronous executor. Defaults and patterns therefore finish before the
body begins, while an abrupt initializer rejects the returned promise instead
of throwing from the call. The generated property with seed `0x5eed0011` now
varies synchronous and asynchronous functions plus absent, truthful, and false
JSDoc or TypeScript hints and nested TypeScript shape mismatches without
filtering. Fixed native evidence covers defaults, patterns, rest, same-name body
`var`, and rejection.
Six reviewed test262 cases pin default selection, prior references, and abrupt
rejection.

Standalone destructuring assignment now accepts recursive array and object
patterns with existing identifier or member leaves and rest targets. The right
operand evaluates once before pattern work and remains the assignment
expression result. A member leaf evaluates its object and computed-key
expression before the corresponding iterator step, source property read, or
default, then converts the key and stores only after selecting the assigned
value. A nullish member base fails before key conversion and resumes through
any active pattern cleanup. Defaults, nested patterns, array and object rest,
computed source keys, conditional `IteratorClose`, immutable-binding errors,
imported-binding errors, and abrupt completion reuse the declaration paths
without creating cells. The generated property suite uses seed `0x5eed000c`
across identifier and member targets, array and object patterns, present,
missing, and nullish inputs, both native specialization policies, and forced
collection. Fixed native fixtures retain expression-result identity,
function-name inference, member-reference order, step failure without close,
target failure with close, and computed-key suppression for nullish source
inputs and member bases. Await inside a member target remains unsupported until
it joins the admitted continuation positions.
Fourteen reviewed test262 cases pin identifier and member writes, nested
patterns, defaults, rest, result identity, nullish and immutable-target errors,
and function-name inference under both strictness and specialization policies.

Synchronous `for-of` assignment heads now accept the same recursive array and
object patterns. Each outer step writes existing identifier or member leaves
without creating cells. Defaults, nesting, rest, nullish failure, immutable
target errors, and member-reference evaluation reuse standalone destructuring
assignment. A pattern failure closes any active inner array iterator before
closing the outer `for-of` iterator. The generated property suite uses seed
`0x5eed000e` across array and object patterns, identifier and member targets,
present, missing, and nullish inputs, both native specialization policies, and
forced collection. Fixed native fixtures retain multiple iterations, object
rest, immutable failure, nullish member key-conversion suppression, and the
inner-before-outer cleanup order. Six reviewed test262 cases pin identifier,
member, default, and array-rest paths.

Compound assignment now accepts `+=`, `-=`, `*=`, `/=`, `%=`, `**=`, `<<=`,
`>>=`, `>>>=`, `&=`, `^=`, `|=`, `&&=`, `||=`, and `??=` for existing
identifier and member targets. Identifier targets perform one checked read
before the right operand and one checked write afterward. Member targets
evaluate their object and property-key expression once. They convert the
retained key value for the read, then convert it again after the right operand
on the taken write path. Logical assignments lower through explicit branches,
so their short path skips the right operand, second conversion, and write.
Anonymous functions on taken logical-assignment paths retain inferred
identifier names, while property targets remain unnamed. Imported and
immutable targets preserve their catchable write errors after the right operand
has run.

The generated property suite uses seed `0x5eed000d` across all 15 operators,
identifier and member targets, bounded numeric inputs, nullish values, both
native specialization policies, and forced collection. Its independent model
also predicts member-reference and right-operand counts. Fixed native fixtures
retain every operator, expression results, logical short-circuiting, computed
property references, observable read and write key conversions, identifier
function-name inference, and immutable failure. Forty-two reviewed test262
`for-of` binding cases now pass because their `+=` loop bodies use the same
lowering. Await inside a compound assignment remains unsupported until
continuation extraction can retain the already-read target value across
suspension.

Prefix and postfix update expressions now accept `++` and `--` on existing
identifier and static or computed member targets. Each form reads the target
once, applies Number coercion before adding or subtracting one, performs one
checked write, and returns the assigned value for a prefix form or the coerced
previous value for a postfix form. This Number path is complete for the current
admitted value profile; BigInt update semantics remain with the later BigInt
unit.

A member target evaluates its object and property-key expression once. The raw
key value converts for the read and converts again for the write, so the two
conversions may select different properties. Immutable binding failure occurs
after operand coercion and retains the resulting side effects. The generated
property suite uses seed `0x5eed000f` across both operators, both result forms,
identifier and member targets, numbers, numeric strings, booleans, and null.
It compares an independent model with Node.js, Deno, both native
specialization policies, and forced collection. Fixed native evidence retains
all four forms, negative zero, infinities, `NaN`, object and key evaluation
counts, distinct read and write key conversions, key-conversion suppression for
a nullish base, and immutable-target failure. Four reviewed test262 cases cover
the four forms across whitespace boundaries, two parse negatives retain the
strict `arguments` early errors, and the admitted classic `for` update promotes
one existing exponentiation case to pass.

### Intrinsics and built-in objects

Establish the intrinsic graph, well-known symbols, iterator protocols, error
objects, and property attributes needed by standard constructors and prototype
methods. Add numeric, string, array, object, function, collection, regular
expression, date, and binary-data families in dependency order.

[*PLAN-REGEXP.md*](./PLAN-REGEXP.md) owns the regular expression family. It
keeps one owned pattern and matcher model across dynamic construction and
ahead-of-time literal compilation, preserves fresh object identity and
`lastIndex`, and defers the matcher backend choice until code-size, Unicode,
resource, and target probes compare the candidates. Regular expressions remain
outside the active profile until that plan admits a coherent semantic
checkpoint.

An intrinsic enters through a table or owned runtime interface whose identity
and attributes are testable. Generated C must not duplicate mutable singleton
state accidentally. Generic algorithms remain authoritative when a fast path
cannot prove its preconditions. Large intrinsic tables and built-in
families extend the runtime components recorded in
[*docs/runtime-components.md*](./docs/runtime-components.md). A family
whose semantics the admitted
profile can already express may instead be self-hosted in the compiled
subset, as [*ROADMAP.md*](./ROADMAP.md) records under M8, keeping only its
primitive operations in the C runtime.

The `Date` family depends on the completed clock and wakeup integration
checkpoint in [*PLAN-NIO.md*](./PLAN-NIO.md), not only on an epoch-based
real-time read. That checkpoint enables the real-time capability and routes
existing production timer waits through the separate monotonic clock in the
same release. `Date.now()` and `Date` operations that obtain the current time
read real time; elapsed scheduling uses monotonic time. Tests inject both clock
domains explicitly. A built-in must not read the bootstrap host's clock or
derive epoch time from the M4 logical scheduler.

The global object enters through this stream in dependency order:
standard constructors become real intrinsic values first, the global
binding model then connects top-level Script `var` and function
declarations to global-object properties while Script lexical
declarations stay declarative and module bindings stay module-scoped, and
`globalThis` is admitted last, after an architecture decision resolves
dynamically created global bindings against closed-world name resolution.
The M6 surface audit in [*PLAN-M6.md*](./PLAN-M6.md) depends on this
order. The future dynamic-source capability track in
[*PLAN-DYN.md*](./PLAN-DYN.md) and interactive session in
[*PLAN-REPL.md*](./PLAN-REPL.md) also depend on the decision, but neither adds
work to the M5 delivery queue.

### Functions and executable syntax

Broaden parameters, arrows, classes, private state, iterators, generators, and
asynchronous control flow only after their required environment and completion
records exist. Every suspension form uses traced state and leaves no native C
stack frame alive.

### Modules and asynchronous execution

Expand module grammar, asynchronous function control flow, promise iterables,
and top-level asynchronous cycles from the M4 subset. Preserve canonical module
identity, one evaluation per module, live cells, job FIFO order, and
deterministic shutdown while broadening syntax.


Ahead-of-time challenge boundary
--------------------------------

`eval`, the `Function` constructor, dynamic import, realms, and source text
created after linking can conflict with closed ahead-of-time compilation. None
enters through an interpreter hidden in a runtime helper.

Before admitting one of these features, an architecture decision must define:

 -  when source becomes known;
 -  how bindings, strictness, realms, and module identity are preserved;
 -  whether produced artifacts remain bootstrap-runtime independent;
 -  how collection and code lifetime are rooted;
 -  which targets can execute the feature; and
 -  how test262 observations remain comparable.

A measured incompatibility may remain explicitly unsupported. M5 progress is
reported honestly even when an ahead-of-time constraint prevents a complete
claim.

[*PLAN-REPL.md*](./PLAN-REPL.md) treats source accepted between interactive
submissions as a tool-level compilation boundary. It does not admit `eval` or
change this standards classification. Any incremental artifact or code-lifetime
evidence it produces must update the applicable architecture decisions before a
running session can load new code.

[*PLAN-DYN.md*](./PLAN-DYN.md) separates closed source, finite precompiled
dynamic modules, late native artifacts, and runtime source compilation. It
does not reopen this M5 boundary. A feature enters the language profile only
after its own entry criteria and an update to ADR 0016.


Compiler and runtime invariants
-------------------------------

Every new syntax node converts immediately to Oseo-owned data. HIR resolves its
bindings and evaluation order. MIR makes calls, allocation, safepoints,
completion, suspension, and generic fallback explicit. The C backend does not
recover semantics from HIR or bootstrap parser details.

Each new heap kind defines tracing before allocation can collect it. Every raw
pointer is reacquired from a rooted value after a safepoint. Resource limits
produce owned diagnostics unless the selected edition requires a catchable
language value.

[*PLAN-GC.md*](./PLAN-GC.md) owns the shared slot, descriptor, root-liveness,
memory-accounting, and collector-policy contracts. M5 semantic units supply
their roots and heap layouts through those contracts rather than adding
family-specific collection paths.

Specialization remains optional. Generated and standards tests compare enabled
and disabled execution, truthful and false hints, guard misses, forced
collection, and visible side-effect order. Compatibility work cannot make type
or JSDoc hints correctness requirements.


Property and differential expansion
-----------------------------------

M5 extends the runner, seeds, replay records, module graph model, and native
schedule model established by [*PLAN-PT.md*](./PLAN-PT.md). It does not create a
second random-program framework.

Grammar-based generators produce scope-correct programs in the active profile.
They retain structured inputs until printing and shrink without introducing
dangling bindings or unsupported syntax. Controlled invalid mutations assert
the exact diagnostic phase, code, and location.

Every new semantic family identifies:

 -  its generated values and boundary classes;
 -  its independent reference or executable model;
 -  behavior-preserving transformations;
 -  forced-collection and failure-injection points; and
 -  direct seed and path replay.

Bounded native properties remain in the ordinary gate. The extended tier runs
larger programs, more seeds, and at least ten times the ordinary case budget.
Any discovered defect leaves a minimized ordinary regression fixture.


Standards harness expansion
---------------------------

The test262 adapter grows before the corresponding manifest. Required harness
includes are implemented as reviewed source, not replaced with native shortcuts
that bypass the behavior under test. Module, asynchronous, agent, realm, and
negative-phase support each report unavailable capabilities honestly until the
harness can observe them.

Selected cases first cover one semantic dependency and its boundaries. Broader
directories enter only after their shared prerequisite is implemented. Updating
the reviewed set includes the manifest delta, unsupported reasons, runtime
cost, and any newly required harness surface.


Performance and code size
-------------------------

M5 records compile time, generated C size, executable size, peak runtime
allocation, and selected workload latency. These measurements guide ordering
and specialization, but they never waive semantic failures.

Collector measurements distinguish requested, committed, live, auxiliary, and
external bytes and record collection pauses under [*PLAN-GC.md*](./PLAN-GC.md).
One peak-allocation number cannot justify a collector or allocator change.

An optimization begins with a generic oracle, structural guard evidence, and a
measured bottleneck. It retains disabled-policy and guard-miss tests. A large
built-in table or generated source expansion needs a size budget and a
replacement boundary.


Delivery order
--------------

1.  Freeze the candidate edition, optional-section policy, compatibility
    manifest schema, and M5 language-profile template.
2.  Expand test262 harness observations for modules, promises, asynchronous
    functions, and top-level await already implemented in M4.
3.  Publish a dependency-indexed baseline that names every supported and
    unsupported group without inflating passes.
4.  Publish the 41,091-path applicable-test inventory under the reviewed
    edition-mapping rule in
    [ADR 0020](./docs/adr/0020-m5-applicable-test-inventory.md).
5.  Complete foundational expressions, coercions, bindings, errors, symbols,
    and iterator protocols required by multiple later families.
6.  Add built-in object families in dependency order with descriptor,
    collector, differential, and property evidence.
7.  Broaden function, class, generator, asynchronous, and module syntax through
    traced environment and continuation records.
8.  Resolve ahead-of-time challenge features through accepted decisions or
    explicit unsupported classifications.
9.  Increase the reviewed standards corpus and grammar-generated corpus while
    keeping ordinary and extended gates within published budgets.
10. Close or explicitly authorize every result inside the checked-in
    applicable-test inventory, and publish the reproducible coverage evidence.
    The unqualified conformance label belongs to the later gate that
    [ADR 0019](./docs/adr/0019-m5-claim-closure.md) defines.

Each checkpoint lands as a coherent semantic unit. It updates the active
profile, manifest, generated domain, package documentation, and living design
documents in the same change.


Exit criteria
-------------

M5 is reported as the three checkpoints recorded in
[*ROADMAP.md*](./ROADMAP.md). M5a admits the core language apart from the
dynamic source family that ADR 0016 excludes, M5b adds the built-in families,
and M5c closes against the applicable-test inventory.

M5 is complete only when:

 -  one named ECMA-262 edition and optional-section policy define the claim;
 -  the complete applicable-test inventory that
    [ADR 0013](./docs/adr/0013-m5-edition-and-manifest.md) requires is checked
    in at an exact upstream revision, and the manifest covers every test in it;
 -  no semantic failure, harness failure, or unauthorized unsupported result
    remains inside that inventory. An unsupported result covered by an accepted
    record that explicitly authorizes an M5 exclusion and bounds its surface is
    recorded rather than closed, under
    [ADR 0019](./docs/adr/0019-m5-claim-closure.md). The unqualified
    conformance label is a separate later gate under that same record;
 -  every admitted syntax and built-in has generic semantics, negative cases,
    collector coverage, and source-located diagnostics;
 -  module, promise, asynchronous, and scheduler tests exercise the expanded
    profile rather than only the M4 subset;
 -  grammar-based properties shrink to valid replayable programs and compare
    Node.js, Deno, specialization policies, and collection modes;
 -  every specialization retains a compiled generic fallback and deliberate
    guard-failure evidence;
 -  strict warnings, sanitizers, Linux AMD64 execution, macOS AArch64
    execution, and AArch64 Linux compile-link checks pass across the complete
    native corpus;
 -  capability, performance, and code-size reports are reproducible from
    documented tasks; and
 -  `mise run check`, `mise run test`, and the extended property task pass from
    a clean checkout.
