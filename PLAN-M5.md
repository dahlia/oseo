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
honest unsupported classifications. The current reviewed manifest records
15,462 reviewed cases: 11,604 passes, 1,506 expected negatives, and 2,352
unsupported profile features with no semantic, harness, or infrastructure
failures.
[ADR 0020](./docs/adr/0020-m5-applicable-test-inventory.md) now fixes the
M5a denominator at 41,091 paths from 47,381 candidates: 22,998 language tests
and 18,093 built-in tests are inside the 16th edition, while 6,290 proposal,
post-edition, or Annex B paths are outside it. The compact inventory remains
separate from the result manifest.

M5a is complete. The 101 indexed records in the normative
[*M5 language profile*](./docs/language-profile-m5.md) are the source of truth
for admitted families and their evidence assessments. The remaining work is
the M5b and M5c dependency order below. The reviewed manifest now records
11,604 passes across 15,462 paths, and the property inventory records 115
domains, 115 seeds, and an ordinary case budget of 5,234.


M5a implementation history
--------------------------

Delivery item 8 is resolved for dynamic source:
[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md) keeps `eval`, the
`Function` constructor, and dynamic import explicitly unsupported with owned
diagnostics and the `dynamic-source` manifest tag.
[*PLAN-DYN.md*](./PLAN-DYN.md) records the deferred capability and evidence
track without reopening the M5 decision. Realms, agents, and shared memory
remain classified through missing harness capabilities.
The M5a portion of delivery item 5 is complete after the optional private read
and call evidence named above. The admitted syntax now
covers every scalar operator family (`typeof`, `void`, `%`, `**`,
bitwise and shift operators, unary `+` and `~`, `&&`, `||`, `??`, the
conditional and comma operators, loose equality, `in`, and
`instanceof`), optional chaining for property, computed, and call steps, and
`delete` for identifier, non-reference, ordinary member, and optional-chain
operands,
`var` declarations with function-scope hoisting,
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
A simple catch parameter may also share its name with a var-scoped declaration.
The enclosing function, Script, or module keeps its hoisted cell, while the
catch clause creates a distinct cell and same-name initializers inside the
catch write that catch cell.
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
their hoisted cells. Generated evidence uses seed `0x60001300` across both
pattern families, defaults, rest, nullish inputs, all three declaration kinds,
both specialization policies, and forced collection. Seven reviewed test262
cases pin the admitted paths.
Synchronous functions, constructors, and arrows now accept recursive array and
object binding-pattern parameters. Parameter initialization runs in source
order in an environment outside the function body, so later parameters retain
their temporal dead zones and body declarations do not leak into defaults.
Generated evidence uses seed `0x60002600` across both pattern families,
present, missing, and nullish inputs, absent, truthful, and false JSDoc hints,
both specialization policies, and forced collection. Name-based JSDoc hints
attach to the pattern binding they describe rather than the hidden aggregate
ABI parameter. Four reviewed test262 cases pin array values, defaults, nesting,
rest, and abrupt completion. Synchronous top-level default parameters now use
the same separate parameter environment and preserve hints on identifier
parameters. HIR and MIR retain JavaScript function length independently from
the ABI parameter count. Generated evidence uses seed `0x60000d00` across
supplied and missing bounded integer values, both specialization policies, and
forced collection. Fixed evidence covers explicit `undefined`, null, prior and
later references, body isolation, abrupt initializers, constructors, arrows,
function-name inference, and function length. Five reviewed test262 cases pin
fallback selection, prior references, and length. Synchronous top-level rest
parameters collect the unbound argument suffix into a fresh array without
changing the generic call ABI. Generated evidence uses seed `0x60002900`
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
`0x60002700` across default, array-pattern, object-pattern, and plain sibling
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
keys. M5a Unit 8.1c adds the noncomputed colon-form `__proto__` prototype
setter without changing computed, shorthand, method, accessor, or spread
definitions. A spread preceding a later top-level await point remains
completed in the traced module continuation. The generated
property suite uses seed `0x60002100`
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

Synchronous generator functions are now admitted, the first unit of the
functions and executable syntax stream. `function*` declarations and function
expressions accept `yield` in any admitted expression position, including
inside loops, conditionals, and `try` blocks. Calling a generator function runs
its environment and parameter prologue immediately and returns a suspended
generator object; only resumption runs the body.
`%GeneratorPrototype%.next(value)` restores the saved state, delivers `value`
as the awaiting `yield`'s result, and returns a fresh `{ value, done }`
object, reporting the body's return value once and `{ undefined, true }`
afterwards. A body that throws completes the generator, and resuming a running
one throws a `TypeError`. `%GeneratorPrototype%.return(value)` resumes a
suspended body with a return completion, so every enclosing `finally` and
iterator close runs before it reports `{ value, done: true }`; a `finally`
that yields reports `{ yielded, done: false }` and one that returns or throws
overrides the requested completion. A generator suspended at its start or
already completed reports `{ value, true }` without entering the body.
`IteratorClose` reaches that method, so a `for-of` that breaks, an array
binding pattern that stops early, or any other consumer that abandons a
generator now runs its cleanup.

A generator body's root slots, saved abrupt-completion records, and iterator
done state live in the generator record instead of a native root frame, so a
suspended generator leaves no live C frame, a suspension taken while a `for-of`
or array binding is still stepping resumes with that iterator's progress
intact, and the collector traces the whole frame through the generator object.
MIR gains a `generator-yield` block terminator that names the resume block, the
slot receiving the sent value, and the block a return resumption continues at,
and the C backend emits one call entry that creates the generator plus one
separately reentrant body whose saved resume point selects the block to
continue at. The saved completions
moved from parallel C arrays into an `OseoCompletionRecord` array shared by
every generated function, so a generator can suspend inside `try` and `for-of`
cleanup without losing its pending completion. One shared
`%GeneratorPrototype%` per context carries the virtualized `next`, `return`,
and `Symbol.iterator`, the same pattern the array iterator already uses, and
every generator function's `prototype` object inherits from it, so all three
resolve through the specified lookup order, a non-object `prototype` falls back
to the intrinsic, and an own property or a replacement `prototype` object
shadows them. Completing a generator discards its `[[GeneratorContext]]`, so a
retained completed generator does not keep its suspended object graph reachable.

`yield* operand` now gets the operand's iterator once and forwards every
resumption to it. A normal resumption steps the captured `next` with the value
the resumption delivered, sending `undefined` on the first step, and suspends
with the inner iterator's own result object, so a result that omits `done` or
carries extra properties reaches the outer consumer unchanged and `value` is
read only on the step that reports exhaustion. That value is the delegating
expression's own result. A return resumption steps the inner iterator's
`return` instead; an iterator with no `return`, or one whose result is done,
ends the delegation and leaves the body through the return completion, while a
result that is not done keeps the delegation alive. No step closes the inner
iterator on an abrupt completion, because the completion came from that
iterator. MIR gains `iterator-delegate-next` and `iterator-delegate-return`
operations and a `resultObject` flag on `generator-yield`, and the generator
record records whether the pending suspension already yielded a complete
iterator result object.

At this checkpoint, `%GeneratorPrototype%.throw`, asynchronous generators, and
generator method definitions remained rejected with source-located
diagnostics; later units admit all three. No throw resumption could reach a
body while `%GeneratorPrototype%.throw` was unimplemented, so the `throw`
branch of `yield*` was then unreachable and unimplemented.
`%GeneratorFunction%` and `%GeneratorFunction.prototype%` stay
unmaterialized: every specified route to them starts at
`Object.getPrototypeOf(function* () {})`, which this profile does not admit,
creating a generator function from one needs the dynamic-source boundary of
[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md), and ECMAScript exposes
no `GeneratorFunction` global binding that could stand in for the intrinsic.
The twenty-three reviewed *test/built-ins/GeneratorFunction/* cases are
recorded as unsupported with the `dynamic-source` dependency tag so that
boundary stays visible in the manifest. Default and
binding-pattern generator parameters are also rejected, because this profile
lowers them as body statements that a generator body reaches only on first
resumption, while `FunctionDeclarationInstantiation` requires them at the call.
The generated property suite uses seed `0x60001c00` across zero to four
suspension steps at statement level, inside a conditional, inside a loop,
inside nested loops, and inside a `for-of` over a nested generator, wrapped in
a cleanup-observing `try`/`finally`, driven by a bounded cycle of sent values
and either drained or closed with `return` after a bounded number of yields,
comparing an independent suspension order, sent value, cleanup, and completion
model with Node.js, Deno, and both native specialization policies with forced
collection on the enabled path. Fixed native fixtures retain single, multiple,
and bare yields, sent values, an empty generator, `length` and inferred `name`,
rest parameters, loop and nested-loop suspensions, per-iteration closure
capture across a suspension, yields in `try`, `catch`, and `finally`, abrupt
completion and the completed state after it, deferred body entry,
self-iterability, non-constructibility, spread, dynamic `this`, hand-written
delegation, the already-running `TypeError`, independent generator identity,
object growth across suspensions under forced collection, suspensions taken
inside `for-of` loops and array binding patterns, and every `return` path: an
implicit close from `for-of` and array destructuring, an explicit close before
the first resumption and after completion, a `finally` that yields, returns, or
throws, and a nested close that closes an inner generator as well. Fifty-nine
reviewed test262 cases newly pass with forty-nine new expected negatives, and
admitting the `generators` feature promotes fifteen existing module-code parse
negatives from unsupported to expected negatives. Implementing
`%GeneratorPrototype%.return` adds seventeen newly passing reviewed cases from
*test/built-ins/GeneratorPrototype/return/*, covering the completed,
executing, and suspended-start states and the `try`/`catch` and `try`/`finally`
resumption paths, alongside two honestly unsupported receiver cases that reach
the method through the unmaterialized `%GeneratorFunction%` chain.

Admitting `yield*` adds fixed fixtures for delegation to another generator with
sent values and a result, to an array, through two nested delegations, inside a
counted loop, over a hand-written iterator whose result object passes through
unchanged, and over one that omits `return`, refuses a `return`, is not
iterable, throws from `next`, or reports a non-object result, plus an explicit
and an implicit close that reach the delegated iterator first and object growth
across delegated suspensions under forced collection. The generated generator
property gains `yield*` steps that forward an inner generator's values alone
and that fold its result into the body's total. Twenty-one reviewed cases from
_test/language/expressions/yield/star-\*_ newly pass with one new expected
negative and four honestly unsupported cases that need `arguments`, the
`Boolean` intrinsic, or an unresolvable reference. The fourteen
`star-rhs-iter-thrw-*` and `star-throw-is-null` cases stay out of the reviewed
subset until `%GeneratorPrototype%.throw` lands, and `star-string` stays out
until strings are iterable. The manifest moves to 736 passes, 319 expected
negatives, and 140 unsupported profile features with no semantic or harness
failures.

Basic class declarations and class expressions are now admitted, the second
unit of the functions and executable syntax stream. A class body is lowered
to one HIR class expression that creates the constructor closure, reads its
prototype object, defines each prototype method, and initializes the
class-scope name binding, in ClassDefinitionEvaluation order. The
constructor uses a new runtime function kind that is constructible like an
ordinary function but is never callable without `new` and whose `prototype`
object is non-writable, non-enumerable, and non-configurable; a body that
omits `constructor` gets a synthesized empty one. Prototype methods reuse
the non-constructible method kind and the anonymous-function name inference
already built for object literal method definitions, but install
non-enumerable data properties through a new
`property-define-method` MIR operation, so `Object.keys` on a class
prototype is empty while `prototype.constructor` still points back at the
class. A named class binds its name immutably in the class's own lexical
environment: the constructor and every method reach it, an outer
declaration binding of the same name stays assignable, and the class-scope
cell is created by the existing `binding-reset` machinery when the class
expression evaluates and initialized only after every element is defined,
so a computed key that reads the class name observes its temporal dead
zone. A class declaration binds its name the way `let` does, so it is
lexically scoped, assignable, and unreachable before the declaration runs.
The whole class body is strict code, including computed keys: MIR gained an
operation-level strictness flag so a computed key's property assignment and
deletion report their failures even when the enclosing script is not strict,
and the runtime inferred name that names an anonymous function stored under a
computed object literal key now names an anonymous class the same way. The
generated
property suite uses seed `0x60000b00` across class declarations, named
class expressions, and anonymous class expressions with zero to two
constructor-assigned fields and zero to three prototype methods over static
and computed keys, comparing an independent name, prototype descriptor, and
definition-order model with Node.js, Deno, and both native specialization
policies with forced collection on the enabled path. Fixed native fixtures
cover the empty class, constructor fields, method `this` and prototype
placement, `name`, `length`, and descriptor observations for `prototype`,
`constructor`, and methods, method non-constructibility, the call-without-
`new` `TypeError`, an object-returning and a primitive-returning
constructor, per-call class identity from a factory function, anonymous and
named class expressions, the inner name binding and its immutability, class
declaration temporal dead zones, computed-key evaluation order and abrupt
completion, last-definition-wins for a duplicate method name, a nested class
inside a method, an anonymous class named from a computed object literal key,
strict-mode rejection inside a class method in a non-strict script, and a
computed key in a non-strict script that assigns to a non-writable property
or deletes a non-configurable one. Seventy-six reviewed test262 cases newly
pass with forty-four new expected negatives, covering class name identifiers
and their escaped forms, method property names over every reserved word,
computed method definitions, `constructor` and `prototype` property
descriptors, method default, trailing-comma, and rest parameter forms,
class-scope name lexical open and close observations, and the strict-mode and
duplicate- binding early errors. Ten deliberately unsupported cases record the
unit's boundaries. At this checkpoint, static initialization blocks and
`export default class` remained rejected with source-located diagnostics;
later units admit both named and anonymous default class exports and static
blocks. Asynchronous class methods are admitted, because they share the object
literal method path exactly; generator and asynchronous generator methods were
then still rejected with the same diagnostic object literals already used and
are admitted by later units. The manifest moves to 812
passes, 363 expected negatives, and 150 unsupported profile features with no
semantic or harness failures.

Class getter and setter accessors are now admitted, the third unit of the
functions and executable syntax stream. A `get` or `set` class element carries
its accessor kind through the owned syntax tree and HIR into the
`property-define-accessor` MIR operation object literal accessor clauses
already use, so a getter and setter pair under one key becomes one accessor
property whose absent slot is preserved from the earlier definition. The
operation gained an enumerability field, because a class accessor is
configurable and non-enumerable while an object literal accessor clause is
enumerable; `Object.keys` on a class prototype therefore stays empty. The
accessor closure reuses the non-constructible method kind and the runtime
`get ` and `set ` name prefixes already built for object literal accessors,
so its `name` follows identifier, string literal, numeric literal, computed,
and symbol keys alike, and `new` on it throws a `TypeError`. The frontend
rejects a getter with a parameter, a setter without exactly one non-rest
parameter and a literal-keyed accessor named `constructor` with
source-located diagnostics; a computed key that evaluates to
`"constructor"` defines an ordinary prototype accessor. Fixed native fixtures
cover a getter, a setter, a pair and its round trip, both halves' `name` and
`length`, the accessor descriptor and its attributes, accessor
non-constructibility, a rejected write to a getter-only accessor from strict
class-body code, an accessor on an anonymous class expression, name inference
over every admitted key form, computed accessor key evaluation order, a getter
replacing a getter while its paired setter survives, an accessor replacing a
method, a method replacing an accessor, and a setter whose parameter is an
array pattern or carries a default. The generated class property suite now
draws each prototype element as a method, a getter, a setter, or a pair, and
models the accessor descriptor, both names, the setter round trip, and the two
key evaluations a computed pair performs. Fifty-six reviewed test262 cases
newly pass, covering computed accessor names, accessor key evaluation errors,
duplicate computed accessor keys, an accessor named `constructor` through a
computed key, setter parameter scope, setter `length` under a default
parameter, and the class-scope name binding observed from a getter and a
setter. One new expected negative records the early error for a getter that
declares a parameter, and sixteen deliberately unsupported cases record the
static accessor boundary and the unresolvable computed key this profile rejects
before execution. The two `grammar-special-prototype-accessor-meth` cases stay
out of the reviewed subset until `Object.prototype.hasOwnProperty` exists. The
manifest moves to 868 passes, 364 expected negatives, and 165 unsupported
profile features with no semantic or harness failures.

Class static methods and accessors are now admitted, the fourth unit of the
functions and executable syntax stream. A `static` element carries a placement
flag through the owned syntax tree and HIR, and MIR lowering chooses the
constructor value instead of the prototype object as the target of the
`property-define-method` and `property-define-accessor` operations the
prototype elements already use. Static and prototype elements share one
source-ordered loop, because ClassDefinitionEvaluation defines every element
in source order and only chooses a different target for each, so a computed
static key and a computed prototype key still interleave by position. A static
element therefore reuses the whole prototype-element contract: the
non-constructible method function kind, the `get ` and `set ` name prefixes,
name inference over identifier, string literal, numeric literal, computed, and
symbol keys, and writable, non-enumerable, configurable placement, so
`Object.keys` on the constructor stays empty. Because it defines an own
property of the constructor, a static element replaces the `name` or `length`
the class installed, and a computed `"prototype"` key throws a `TypeError`
against the non-writable, non-configurable `prototype` property. At this
checkpoint, static initialization blocks and private static methods and
accessors stayed rejected with the class element diagnostic they already had;
later units admit all three. Fixed native fixtures
cover a static method, a static getter and setter pair, `this` inside a static
method called through the class and through a detached reference, the static
method descriptor and its attributes, static `name` and `length` for methods
and both accessor halves, static non-constructibility, an instance that does
not inherit a static member, a class that defines the same name statically and
on the prototype, a static member on an anonymous class expression,
interleaved computed static and prototype key evaluation order, numeric,
string literal, symbol, and computed static keys, a static element that
replaces `name` and `length`, the computed `"prototype"` rejection, a static
`"constructor"` key that leaves `prototype.constructor` intact,
last-definition-wins across a static method and accessor under one key, a
static accessor round trip, and the class-scope name binding read from a
static method and getter. The generated class property suite now places each
drawn element on the prototype or on the constructor and reads it through the
matching owner. Eighty-two reviewed test262 cases newly pass, covering the
`accessor-name-static` and `method-static` families in both class forms,
static setter and method parameter-body variable scope, static method
`length` under a default parameter, the computed `"prototype"` `TypeError`,
and the eight previously unsupported prototype accessor descriptor and
`name` cases whose classes also define static accessors. Fifteen new expected
negatives cover static method parameter `yield` and the static class name
identifier early errors, while six new unsupported cases record the
unresolvable computed accessor key, the static field element name, and the
generator methods the `fn-name` and `fn-length` static precedence cases
require. The manifest moves to 950 passes, 379 expected negatives, and 156
unsupported profile features with no semantic or harness failures.

Class inheritance is now admitted, the fifth unit of the functions and
executable syntax stream. A class expression carries its `extends` operand as
one heritage expression that MIR lowers in the class-scope environment before
the constructor closure exists, so a heritage operand that reads the class
name observes its temporal dead zone and a side effect in it runs before any
element key. One new runtime entry point validates the operand and links both
chains together: the constructor's `[[Prototype]]` becomes the parent
constructor and the class `prototype` object's `[[Prototype]]` becomes
`Get(parent, "prototype")`. Static members therefore resolve through the
constructor chain and instance members through the prototype chain, and both
objects stay out of dictionary mode because a class definition allocates them
itself. A derived constructor owns a `this` binding rather than reading its
receiver, as a fresh uninitialized cell per invocation, so reading `this`
before `super()` throws a `ReferenceError` through the temporal-dead-zone
machinery lexical declarations already use, and every arrow function nested in
the constructor shares that cell. `super()` reads the running constructor's
own `[[Prototype]]`, rejects a non-constructor with a `TypeError`, constructs it
with a fresh receiver allocated from `new.target`'s prototype, and binds the
result. A second `super()` performs that construction again before
`BindThisValue` throws a `ReferenceError`, so the parent runs against a distinct
receiver even when its instance initialization includes private elements. A
base constructor that returns its own object replaces the freshly allocated
receiver. An error constructor reached through `super()` takes its instance
prototype from the same new target rather than from its own `prototype`, so
`class AppError extends Error {}` produces instances whose prototype is
`AppError.prototype`, while a direct `new Error` supplies itself as the new
target and is unchanged. The addition specialization declines a derived
constructor, because its fast path would leave the block before the
`derived-return` operation the `this` binding routes every `return` through,
so a parameter hint cannot change what a derived constructor returns. Because
each call constructs a fresh receiver, a parent that publishes its receiver
exposes two distinct objects across two calls and private instance elements do
not turn the required second-call `ReferenceError` into an earlier
`TypeError`. Every `return` of a derived constructor leaves
through that binding,
so an object stands as written, `undefined` yields the bound `this`, and any
other value is a `TypeError`; MIR rewrites the terminators after the body is
built, so a `return` inside `try` still runs a `finally` that calls `super()`.
A body without a `constructor` gets the implicit
`constructor(...args) { super(...args); }` with a synthetic rest parameter
name and a `length` of zero. `new.target` is admitted as its own expression
over the construction target the call ABI already carries: it is the
constructed class through every `super()` hop and `undefined` for an ordinary
call, a method call, a generator body, and an asynchronous function. An arrow
captures the enclosing function's `super()` constructor context and
`new.target` alongside its lexical receiver. Nested arrows retain that context,
while an intervening ordinary function starts its own. Fixed native fixtures
cover two-level and three-level chains,
an inherited method, accessor, and static member, a derived class with no
constructor, named and anonymous derived class expressions, a class extending
an ordinary function, derived `name` and `length`, the derived `prototype`
descriptor and empty own keys, `this` read before `super()`, a missing
`super()`, a double `super()`, a derived constructor returning a number,
`undefined`, and an object, a base constructor that returns its own object,
`super()` in both branches of a conditional, a `return` inside `try` whose
`finally` calls `super()`, an arrow created before `super()`, an ordinary
nested function keeping its own `undefined` receiver, a rest parameter
forwarded through `super()`, calling a derived class without `new`, heritage
and computed-key evaluation order, a class extending itself, every rejected
operand form, `extends null` with and without an explicit constructor, a
parent whose `prototype` is `null`, a heritage operand read through a getter,
per-call derived class identity from a factory, and `new.target` in an
ordinary function, a class constructor, a method, a static method, a
three-level derived chain, a generator, and an asynchronous function, a hinted
and an unhinted derived constructor returning a sum, and an `Error` and a
`TypeError` subclass including a two-level chain and a subclass that adds its
own state after `super()`. The
generated class property suite now draws each class standing alone, extending
a base class through a declared `super()` call, or extending it through the
implicit derived constructor, and models the inherited field, prototype
method, and static member. Sixty-six reviewed test262 cases newly pass,
covering the `subclass` default and derived-return-override families,
`super()` argument and spread evaluation, `BindThisValue` and its second-call
rejection, the `super()` expression value, heritage identifier references,
heritage class-scope lexical open observations, a rejected arrow,
asynchronous, and accessor heritage, a parent `prototype` setter, a static
method override, `extends null` prototype wiring, and the `new.target` value
through calls, member expressions, `new`, and `super()`. Three new expected
negatives record the escaped `new.target` early errors and the module-goal
`new.target` early error the added feature tag now reaches. Unit 6.6 later
promotes the lexical arrow cases. The remaining unsupported cases require
`Reflect`, `Function.prototype.bind`, typed-array, or `Object` intrinsics. The
two
`definition/prototype-getter` and `definition/prototype-setter` cases leave
the reviewed subset until `Function.prototype.bind` exists, because the
heritage they build starts from a bound function. The manifest moves to 1016
passes, 382 expected negatives, and 169 unsupported profile features with no
semantic or harness failures.

`super` property references are now admitted, the sixth unit of the functions
and executable syntax stream. A class definition records each element's home
object through one new runtime binding: the class `prototype` object for an
instance element and the constructor itself for a `static` one, which are the
two objects the heritage link already relates. A reference reads the
`[[Prototype]]` of the home object its running function carries, so an instance
reference starts its lookup at the parent's `prototype` and a static one at
the parent constructor, and both keep the enclosing element's `this` as the
receiver. MIR therefore carries the lookup object and the receiver as separate
operands of one property operation instead of introducing a second property
machinery. A read shares the ordinary property inline cache, guarded on the
lookup object, so a data property the parent prototype owns hits the cached
slot while an inherited property and an accessor take the generic path; the
fast path never observes the receiver, because the cache refuses accessor
slots. An assignment is `Set` with a distinct receiver: a setter found on the
base chain runs against `this`, and an assignment that reaches no setter
creates or updates an own property of `this` without consulting an accessor
that only the receiver's own chain would find. A computed reference reads its
receiver before its key, so `super[key()]` inside a derived constructor throws
the uninitialized-`this` `ReferenceError` before `key` runs, and reads the home
object's `[[Prototype]]` after that key, so a key expression that replaces the
prototype is observed by the very reference it precedes. A reference stays
rejected with a source-located diagnostic in a class body without `extends`
and in an object literal method, because this runtime has no
`Object.prototype` object for that lookup to reach, and as the operand of
`delete`, a destructuring assignment target, or a `for` head. Arrows capture
the enclosing class element's home object, and asynchronous class elements
carry it through their synthesized execution function. An optional call such
as `super.m?.()` guards the looked-up method value and calls a present method
with the same derived receiver. Fixed native
fixtures cover a read, a method call, and a detached method value through
two-level and three-level chains, an override reached from the parent through
the derived receiver, an accessor read and its receiver, a write that reaches
a parent setter, a write that shadows a receiver accessor without running it,
a write that creates an own data property and its descriptor, a compound
assignment and both update forms reading the parent and writing the receiver,
a write to a read-only parent property, computed references over a string,
symbol, and index key, computed-key evaluation order against the `this`
temporal dead zone, a reference inside a derived constructor before and after
`super()`, static method, getter, and setter references through the
constructor chain, a nested class taking its own home object, and cached,
inherited, and accessor reads with their guard hit and miss counts. The
generated class property suite now draws a reading body that returns a base
member reached through `super` and a setter clause that stores through
`super`, on the prototype and on the constructor. Unit 6.6 adds a directly
generated lexical-arrow domain, and Unit 8.2 adds a separate present-and-absent
optional-call domain without changing that reviewed property. Eighteen reviewed
test262
cases newly pass, fifteen of them newly reviewed and three leaving the
unsupported list, covering the `prop-dot` and `prop-expr` value, receiver,
null-prototype, and uninitialized-`this` families, the `super` in-method and
in-accessor cases, and the `new.target` value read through a `super`
property. Thirty-three new unsupported cases record the unit's boundaries and
the `Object.freeze`, `Object.setPrototypeOf` ordering, `Object` heritage, and
`Test262Error` observations the remaining cases need. The manifest moves to
1034 passes, 382 expected negatives, and 199 unsupported profile features
with no semantic or harness failures.

Public instance class fields are now admitted, the seventh unit of the
functions and executable syntax stream. A `field = expression` element pairs
the key its class body evaluates once with a closure that produces the value
once per instance, and one new runtime entry point records that pair on the
constructor in class-body order, which is ECMA-262's `[[Fields]]`. A second
entry point runs the list as InitializeInstanceElements against one instance,
reading the field list from the running constructor rather than from an
operand, so a base constructor reaches its own class's fields and a derived
one only the fields its own class declared. MIR emits that operation at the
entry of a base constructor, before its body and therefore before a parameter
default can observe the instance, and where `super()` returns in a derived
one, so a base constructor never observes a derived field and the
`ReferenceError` a second `super()` reports arrives before the fields could
run again. Each field becomes an own writable, enumerable, configurable data
property through CreateDataProperty, so an inherited setter never runs, a
non-writable inherited property does not reject the definition, and a field
shadows a prototype method of the same name. HIR builds the initializer
closure itself rather than resolving a synthesized syntax function, because
its body is exactly one `return` and it declares nothing: that keeps the
initializer's scope the class scope instead of the constructor's parameters,
gives it its own receiver so a derived constructor's `this` binding stops at
it and a nested arrow captures the instance, and lets the existing static-key
name inference reach the returned expression. A computed key that names an
anonymous initializer travels to the closure through a fresh cell the class
body fills with the one key evaluation it performs, which is ECMA-262's
`[[ClassFieldInitializerName]]` without a second evaluation. The initializer
carries the class prototype as its home object, so `super.x` inside it starts
at the parent's prototype with the instance as the receiver, including under
the implicit derived constructor. Deliberate boundaries: a field named
`constructor` and the TypeScript `declare`, `readonly`, `definite`, and
optional field modifiers stay rejected with source-located diagnostics. Fixed
native fixtures cover a field with and without an initializer, the own-property
descriptor, per-instance copies, an inherited setter that does not run, a
non-writable inherited property, a shadowed prototype method, interleaved key
and initializer order across methods and static elements, an abrupt key and an
abrupt initializer, base and derived ordering, the implicit derived
constructor, `super()` in both branches of a conditional, a replaced derived
result, a rejected second `super()`, parameter defaults reading a field, the
class scope against a constructor parameter of the same name, arrow
initializers, name inference over every admitted key form, per-evaluation
naming from a factory, ToPropertyKey coercion, `super` calls and accessor reads
in initializers over a two-level and a three-level chain, and a hinted
constructor whose addition specialization keeps its fields on every guard path.
The generated class property suite now draws each element as a field with an
initializer, without one, or with an anonymous function the key names, and
models the instance's own key order and the initializer markers. The reviewed
subset also gains the `arrow-function` feature tag, which the eight
arrow-initializer early-error cases need and which no reviewed case
reclassifies. Forty-three reviewed test262 cases newly pass, seventy-eight new
expected negatives record the `arguments`, `super()`,
automatic-semicolon-insertion, and reserved field name early errors, and
twenty-eight new unsupported cases record this unit's boundaries. The manifest
moves to 1077 passes, 460 expected negatives, and 227 unsupported profile
features with no semantic or harness failures.

Private instance class elements are now admitted: a `#name` field, a
`#name()` method, and a `get #name` or `set #name` accessor declare a private
name owned by the class body rather than a property key. A private element is
not a property, so no key observation, enumeration, or descriptor read
reaches it. Each class evaluation creates its private names afresh, so
instances from two evaluations of one class expression never satisfy each
other's elements, and a derived class that spells a base's name declares its
own. A read or write against an object without the declaring class's brand
throws a `TypeError`. Private methods and accessors are installed before any
field initializer runs, matching InitializeInstanceElements, so an
initializer reaches a method declared later in the body. A private method is
not writable and is the same non-constructible method kind prototype methods
use, carrying the class prototype as its home object so `super.x` works
inside it. A derived constructor installs its private elements where
`super()` returns, so a private read before `super()` reports the `this`
temporal dead zone `ReferenceError` rather than a brand `TypeError`.
Compound assignment and the update operators read and write the element once
through the same name. A private reference may use another object as its base
and applies the same private-name lookup and brand check. At this checkpoint,
`#name in object`, optional `?.#name` access, and a private reference used as a
destructuring or `for-of` assignment target stayed rejected with source-located
diagnostics. Later units admit the brand check and private assignment target.
The frontend carries optional private reads and method calls through HIR and
MIR. M5a Unit 8.5o adds native and differential execution for their nullish
short circuit, valid-brand access, invalid-brand `TypeError`, and method
receiver preservation under both specialization policies and forced
collection. `delete this.#name` remains an early error.
Fixed
native fixtures cover private fields, methods, accessors, brand checks,
updates, the values private state can hold, and a hinted method that
specializes while private elements surround it on every guard path. The
generated class property suite draws private elements alongside public ones.
Eighty-four reviewed test262 cases newly pass, three hundred sixty-six new
expected negatives record the private name early errors, and seventy new
unsupported cases record this unit's boundaries. The manifest moves to 1161
passes, 826 expected negatives, and 297 unsupported profile features with no
semantic or harness failures.

Static class fields are now admitted, the ninth unit of the functions and
executable syntax stream. A `static field = expression` and a
`static #field = expression` element reuse the whole field pipeline and
change only where the definition lands: the class definition itself performs
DefineField against the constructor instead of recording the pair the
constructor replays for each instance. The class body still evaluates every
element's key and creates every initializer closure in one source-ordered
loop, so a computed static key interleaves with a computed instance key by
position; the static initializers then run after that loop and after the
class-scope binding is initialized, which is ECMA-262's staticElements step.
That order is observable: a static initializer reaches a method declared
later in the body, reads the class through its own name rather than in a
temporal dead zone, and runs before any instance is constructed. A public
static field becomes an own writable, enumerable, configurable data property
through CreateDataProperty, so it replaces the configurable `name` and
`length` a class starts with rather than assigning through them, and a
private one becomes a private element the constructor itself carries, which
no key observation, enumeration, or descriptor read reaches. The initializer
takes the constructor as its receiver and carries it as the home object, so
`this` is the class, a nested arrow captures the class, and `super.x` starts
at the parent constructor. Because a class definition completes before the
class that extends it begins, a derived class's static fields always run
after its parent's. Two new runtime entry points perform the public and the
private definition; the constructor's instance element list stays untouched,
so a class whose only elements are static declares no instance elements at
all. Static private methods and accessors are installed on the constructor,
and a `C.#name` reference uses that constructor as its brand-checked base.
Static accessor halves merge under one private name just as instance accessor
halves do. A static field named `constructor` or `prototype` remains the early
error it is.
Fixed native fixtures cover the own-property descriptor, a field without an
initializer, the receiver and the nested arrow, replaced `name` and `length`,
a later assignment and deletion, subclass inheritance and redeclaration,
interleaved key and initializer order across instance and static elements, an
abrupt static initializer and an abrupt static key, NamedEvaluation over
every admitted static key form, static private reads, writes, updates, and
brand failures across evaluations, subclasses, and instances, a static
private field holding a function, `super` reads over a two-level and a
three-level chain, and a hinted method that specializes while static elements
surround it on every guard path. The generated class property suite now draws
each field element on either placement and models the constructor's own key
order and the definition-time initializer markers. Forty-two reviewed test262
cases newly pass, forty-five new expected negatives record the `arguments`
and `super` static initializer early errors, and sixty-eight new unsupported
cases record boundaries later units own. The reviewed subset
gains the `class-static-fields-public` and `class-static-fields-private`
feature tags; the remaining cases those tags reach need `String`, further
`Object` members, `eval`, `Proxy`, `Function`, or generator and asynchronous
methods, and stay outside the reviewed subset until the units that own them
land. The manifest moves to 1203 passes, 871
expected negatives, and 365 unsupported profile features with no semantic or
harness failures.

Cross-instance and static private access are now admitted as Unit 6.1.
`other.#name` evaluates its base once, resolves the private name lexically,
and applies the declaring class's brand check to that selected object for
fields, methods, and accessors. `C.#name` performs the same lookup against the
constructor object. Static private methods and accessors are installed on that
constructor, while instance methods and accessors remain installed for each
instance; each placement merges getter and setter halves under one private
name and rejects a receiver carrying the wrong brand. Runtime ABI
`oseo-runtime-m5-28` adds the static private method and accessor definition
entry point.

Fixed native fixtures cover successful field, method, and accessor access on
other instances and on the class constructor, wrong-brand ordinary objects,
instances, prototypes, subclasses, and primitive values, accessor writes,
private-method calls, absence from property observations, both specialization
policies, and forced collection. The generated class property suite uses seed
`0x60000b01` for instance and static placement, every private element kind,
valid and invalid receivers, both specialization policies, and forced
collection under Node.js, Deno, and native execution. Seventy-eight existing
reviewed test262 cases move from unsupported to pass, and four focused static
private accessor cases enter as passes. The reviewed subset gains the
`class-static-methods-private` feature tag. The manifest moves to 1,883 passes,
1,120 expected negatives, and 963 unsupported profile features with no
semantic or harness failures.

Subsequent evidence admits the private forms this checkpoint still rejected.
`#name in object` has a fixed native differential fixture and a generated
property with seed `0x60000b02` that compares an independent brand model with
Node.js, Deno, and native execution under both specialization policies and
forced collection on the enabled path. Nineteen reviewed test262 cases cover
its runtime behavior and early errors. Focused frontend tests pin private
destructuring and for-of assignment targets through the existing private-set
operation, and five reviewed test262 cases execute them under both
specialization policies. M5a Units 8.5l and 8.5m later exercise the same
private-target path in direct and object-pattern for-in heads under native
differential execution, both specialization policies, and forced collection.

Class static initialization blocks are now admitted, the tenth unit of the
functions and executable syntax stream. A `static { ... }` element declares
nothing and evaluates no key, so it is not a definition at all: it is a
statement list the class definition runs once. The frontend converts the
block to a parameterless function body with the same element function kind a
method has, which gives it `var` hoisting, block-level declarations, and the
strictness a class body already established for free, and makes each block a
separate body whose bindings no other element and no enclosing scope reaches.
Lowering creates that closure where the block appears, binds the constructor
as its home object, and calls it with the constructor as its receiver once
the class is otherwise complete, which is EvaluateStaticBlock. The call is an
ordinary call, so this unit adds no runtime entry point, no backend
operation, and no C at all.

Blocks and `static` field initializers now share one deferred, source-ordered
list, which is ECMA-262's staticElements step. That order is observable: a
block and a static field interleave by position, both run after every key and
every method and after the class-scope binding is initialized, and an abrupt
block stops the class definition where it threw. Inside a block `this` is the
constructor, so a nested arrow captures the class, an ordinary nested
function keeps its own strict receiver, `new.target` is `undefined`, and
`super.x` starts at the parent constructor in a derived class. A block
reaches the static private elements its class declares through that receiver,
and a class whose only element is a block declares no instance element.
`arguments`, `return`, `super()`, `await`, `yield`, and an unlabeled `break`
or `continue` inside a block stay the early errors they are.

Fixed native fixtures cover a lone block and its own-property observation,
several blocks in source order, the receiver and a nested arrow, the
class-scope name binding and a method declared later, an anonymous class
expression named before its blocks run, interleaving with static fields and
computed keys, an abrupt block in a class expression and in a class
declaration, per-block `var`, `let`, `const`, and function declarations,
static private access, per-evaluation identity, a nested class inside a
block, loops and `try` inside a block, `super` reads over a two-level chain,
parent-before-child definition order, and a hinted method that specializes
while blocks surround it on every guard path. The generated class property
suite now draws a static block alongside the other elements. Twenty-seven
reviewed test262 cases newly pass, twenty-seven new expected negatives record
the `await`, `arguments`, `return`, `super()`, `yield`, and unlabeled
control-flow early errors, and eight new unsupported cases record the
boundaries this unit keeps. The reviewed subset gains the
`class-static-block` feature tag; the one remaining case that tag reaches
inside the admitted syntax, *static-init-sequence.js*, stays outside the
reviewed subset pending separate review. The same interleaving remains covered
by a native fixture; Unit 7.4's later narrow `%Array.prototype.push%`
dependency does not reclassify this class case. The manifest moves to 1230
passes, 898 expected negatives, and 373
unsupported profile features with no semantic or harness failures.

The asynchronous iterator protocol and the `for await (... of ...)` statement
are now admitted, the eleventh unit of the functions and executable syntax
stream. `GetIterator(value, async)` reads `Symbol.asyncIterator`, calls it,
and captures the iterator's `next` method once, and a value with no such
method falls back to the synchronous protocol and wraps that record, which is
CreateAsyncFromSyncIterator. The wrapper is a runtime-internal record with no
prototype and no properties, because nothing outside the loop reaches it.
Each step awaits the result of the captured `next` method, requires an
object, and reads `done` and `value`; a wrapped synchronous iterator instead
awaits the stepped value, which is what makes a synchronous iterable of
promises yield settled values, and the head then awaits the promise the
wrapper method settles. Every wrapper path reaches that outer await,
including the abrupt ones that reject the same promise rather than throwing
to the head, so a fallback step interleaves with queued jobs exactly where a
reference host places it. `AsyncIteratorClose` awaits the `return`
result and requires an object; the wrapper instead requires the synchronous
result to be an object and then reads and awaits its `done` and `value`
before completion precedence applies, so an in-flight body error still
observes those getters.

The head reuses the synchronous `for-of` lowering unchanged. One flag on the
three iterator operations selects the protocol, and the loop shape, the head
forms, the temporal dead zones, the fresh per-iteration cells, the `var`
hoisting, and the conditional close all stay the code that already exists.
That is why `break`, `continue`, `return`, labeled transfers, and body throws
work with the same completion precedence as the synchronous head: a close
failure replaces `break` or `return`, an in-flight throw stays authoritative,
and `continue` keeps the iterator open. `Symbol.asyncIterator` joins the
well-known symbols, and the runtime gains three entry points, which bumps the
ABI to `m5-23`.

At this checkpoint, a step suspended by draining the scheduler rather than by
returning to the caller, because the frontend split an `await` expression into
continuations and a loop had no such split. Unit 7.5 now closes that deviation
inside ordinary asynchronous functions and asynchronous generators through
their shared traced frame. Unit 7.6 now closes through the same frame in those
contexts. Module top-level steps remained the Unit 7.7 boundary.
Unit 7.7 now closes that final drain-based boundary through a private traced
module continuation.

Native differential fixtures cover the synchronous fallback, generator and
user iterables, `Symbol.asyncIterator` preference over `Symbol.iterator`,
promised and direct step results, `done` and `value` accessor order,
timer-driven steps, the turns a wrapped step and a wrapped close each spend
against previously queued reactions,
every head form, closures over per-iteration cells, the
head's dead zone, every transfer, absent, promised, and throwing `return`
methods, nested and `finally`-wrapped loops, and every catchable `TypeError`
the protocol defines. A generated property with seed `0x60001200` draws
asynchronous and synchronous iterator kinds, head forms, transfer positions,
and close modes under both specialization policies and forced collection.
At this checkpoint asynchronous generators stayed rejected, so the
asynchronous generator cases the `async-iteration` tag reached stayed outside
the reviewed subset. A later unit admits asynchronous generators.
Two hundred eighty-one reviewed test262 cases newly pass, ninety new expected
negatives record the head's early errors, and eight new unsupported cases
record that asynchronous generator boundary. The reviewed subset gains the
`async-iteration` and `Symbol.asyncIterator` feature tags, and the manifest
moves to 1511 passes, 988 expected negatives, and 381 unsupported profile
features with no semantic or harness failures.

Asynchronous generator functions are now admitted, the twelfth unit of the
functions and executable syntax stream. `async function*` declarations and
function expressions reuse the generator suspension record rather than the
frontend continuation split, so one body suspends at `await` and at `yield`
through the same saved frame. That is the real suspension record the
`for await` unit deferred: a suspension leaves the body with a reason, and the
driver either settles an awaited operand and resumes later or reports a step.
Because the frame is the generator's own, `await` is admitted in every
expression position inside such a body instead of only in the M4 continuation
positions.

`next`, `return`, and `throw` each enqueue one AsyncGeneratorRequest and
return its promise immediately. The queue's head owns the running step, so a
call that arrives while the body runs or awaits waits its turn instead of
reaching a running body, and each step reports through the promise its own
call returned. Resuming a body needs a third resumption kind: MIR's
`generator-yield` terminator gains an `awaited` marker and an optional
`throwResume` block, and the C backend emits the matching branch only where a
driver can deliver that resumption, so a synchronous body's emitted code is
unchanged. `yield` awaits its operand before the step reports it and
`return expr` awaits its own, while a `yield*` step awaits nothing, which is
what keeps a promise the delegated iterator produced from being unwrapped.

`yield*` acquires the asynchronous iterator, falls back to the wrapped
synchronous protocol, and forwards a normal, a return, and a throw resumption
to the inner iterator through three delegation entry points. An inner iterator
with no `throw` method is closed and the delegation reports a `TypeError`. The
runtime gains the request queue, `%AsyncGeneratorPrototype%`, the two await
reactions, and those delegation entry points, which bumps the ABI to `m5-24`.

Native differential fixtures cover the step and resumption surface, delegation
over arrays, synchronous generators, asynchronous generators, and hand-written
asynchronous iterators, rejected awaits, timer-driven awaits, queued requests,
and the exact microtask interleaving of two generators against five chained
reactions. A generated property with seed `0x60000700` draws bounded bodies,
awaited and promised operands, three delegation kinds, guards, and every
resumption position under both specialization policies and forced collection.

At this checkpoint, the awaits a `yield*` step took still drained the
scheduler. Unit 7.5 now moves next, return, and throw delegation steps through
the asynchronous generator's traced frame. Unit 7.6 now moves the
missing-`throw` close through that frame as well.

V8 enumerates an accessor defined after an object literal spread property
last instead of in property-creation order, so Node.js and Deno cannot act
as references for that one combination. The generated suite rewrites such
an accessor as a data property, and the fixed
*tests/fixtures/object-spread-accessor-order.js* native scenario asserts
the ECMA-262 order directly without a reference observation, alongside the
accessor-before-spread order both references do agree with.

The asynchronous generator intrinsic chain is now materialized, the thirteenth
unit of the functions and executable syntax stream. `%AsyncIteratorPrototype%`,
`%AsyncGeneratorPrototype%`, `%AsyncGeneratorFunction.prototype%`, and
`%AsyncGeneratorFunction%` are created as one lazily built cluster, because
their `constructor` and `prototype` links are circular and no partially wired
intrinsic may become observable. The cluster reaches the context only after
every property is defined, and its allocations are restored the way the error
intrinsics restore theirs, so an intrinsic created on first use never enters
the observed program's allocation count.

The four methods stop being brands that a property read synthesizes and become
ordinary own properties of the objects the specification places them on:
`next`, `return`, and `throw` on `%AsyncGeneratorPrototype%`, and
`Symbol.asyncIterator` one link further out on `%AsyncIteratorPrototype%`,
which `%AsyncGeneratorPrototype%` now inherits from. A descriptor read, a
deletion, and an assignment therefore observe the same set a property read
does, which the brand could not offer, and a replaced `prototype` object
reaches exactly the methods its own chain still retains.
`%AsyncGeneratorPrototype%` gains own `constructor` and
`Symbol.toStringTag` properties, `%AsyncGeneratorFunction.prototype%` gains
own `constructor`, `prototype`, and `Symbol.toStringTag` properties, and every
asynchronous generator function has `%AsyncGeneratorFunction.prototype%` as its
`[[Prototype]]`, which is what makes its `constructor` reach
`%AsyncGeneratorFunction%`. That constructor exists so the chain is complete;
calling or constructing it reports the `OSEO1001` dynamic-source diagnostic of
[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md) rather than compiling
source text, which is the one reference a property chain can still reach after
the frontend has rejected every dynamic source form it can see. The runtime
gains three context roots and one internal entry point, which bumps the ABI to
`m5-25`.

Three of the cluster's `[[Prototype]]` links stay null because this profile
materializes neither `%Object.prototype%` nor the `Function` intrinsics:
`%AsyncIteratorPrototype%` should inherit from `%Object.prototype%`,
`%AsyncGeneratorFunction.prototype%` from `%Function.prototype%`, and
`%AsyncGeneratorFunction%` from `%Function%`. No reviewed test262 case promotes:
every *test/built-ins/AsyncGeneratorPrototype/* and
*test/built-ins/AsyncIteratorPrototype/* case reaches the intrinsics it checks
through `Object.getPrototypeOf`, or through `Object` or `Promise` as a value,
and none of the three is admitted, so the manifest stays at 1,732 passes, 1,107
expected negatives, and 1,012 unsupported profile features. The profile's known
gaps gain that entry, which the intrinsics and built-in objects stream owns.

One native differential fixture covers both intrinsic identities shared across
two generator functions, the four `constructor` and `prototype` links,
`%AsyncGeneratorFunction%`'s `name` and `length`, both `Symbol.toStringTag`
values, `in` agreeing with a property read across the whole chain, every own
property descriptor including the four methods and the link each sits at,
deleting a configurable method, the empty enumerable key sets, the shared
method identities with their `length` and `name`, a borrowed
`Symbol.asyncIterator` returning an ordinary receiver, the
`%AsyncGeneratorPrototype%` fallback a non-object `prototype` produces, a
replaced `prototype` object that reaches only its own `next`, and each of
`next`, `return`, and `throw` rejecting rather than throwing for a
non-generator receiver, including the intrinsic prototype itself. It runs under
forced collection so the three new context roots are traced.

The asynchronous iteration built-in inventory is now closed, the fourteenth
unit of the functions and executable syntax stream and the last M5a unit of
that family. It adds no capability. Every 16th-edition path under
*test/built-ins/AsyncIteratorPrototype/*,
*test/built-ins/AsyncGeneratorFunction/*,
*test/built-ins/AsyncGeneratorPrototype/*,
*test/built-ins/AsyncFromSyncIteratorPrototype/*, and
*test/built-ins/Symbol/asyncIterator/* is now either a reviewed manifest entry
or a named gap, so the family's remaining inventory is measured rather than
assumed.

The reviewed harness gains an *asyncHelpers.js* adaptation, which ten of the
promoted cases need. Upstream `asyncTest` detects `$DONE` through
`Object.prototype.hasOwnProperty.call(globalThis, "$DONE")`, and upstream
`assert.throwsAsync` renders the observed constructor name into its failure
message; the profile admits neither `globalThis` nor generic string coercion,
so the reviewed adaptation probes the binding with `typeof` and reports a
constructor mismatch without composing a message from the observed value. Like
every other reviewed harness, it is written inside the admitted profile rather
than copied from upstream, and it changes no already reviewed case, because a
harness include is opt-in through frontmatter.

Twenty-six reviewed cases newly pass and six new unsupported cases record the
family's boundaries, all of them promotions of existing behavior:
*test/built-ins/AsyncFromSyncIteratorPrototype/* enters the manifest with
twenty-five passes and four unsupported cases, and
*test/built-ins/Symbol/asyncIterator/* with one of each. The manifest moves to
1,758 passes, 1,107 expected negatives, and 1,018 unsupported profile features
with no semantic or harness failures. Of the closed directories,
*AsyncIteratorPrototype/* holds four reviewed cases and
*AsyncGeneratorFunction/* twenty-three, every one of them unsupported because
reaching those intrinsics needs `Object.getPrototypeOf` or the dynamic-source
boundary; nine further *AsyncIteratorPrototype/* paths are `Symbol.asyncDispose`
cases that [ADR 0020](./docs/adr/0020-m5-applicable-test-inventory.md) places
in the 2027 edition, outside the M5a denominator.

Seven cases stay outside the reviewed subset. Unit 7.6 promotes the four
*next* cases and one *throw* case that
observe AsyncFromSyncIteratorContinuation closing the wrapped synchronous
iterator when an awaited stepped value rejects. `PromiseResolve` does not read
the resolved value's
`constructor`, so a poisoned `constructor` getter neither rejects nor reaches
the generator, which three *AsyncFromSyncIteratorPrototype/* poisoned-wrapper
cases and the three *AsyncGeneratorPrototype/return/* broken-promise cases
observe. The remaining
*AsyncFromSyncIteratorPrototype/throw/iterator-result.js* case stayed outside
Unit 7.6; its former missing `%GeneratorPrototype%.throw` attribution was
stale, and M5a Unit 8.4 later traced the forwarded throw, repaired the two
defects the trace exposed, and promoted the case as a pass.
Eight
*test/built-ins/Function/prototype/toString/* cases the `async-iteration` tag
reaches need an *nativeFunctionMatcher.js* include that has no reviewed
implementation. Each is now a profile gap entry with a named owner.

The wider `async-iteration` inventory outside these directories is measured
but not promoted. Three thousand five hundred sixty-seven 16th-edition paths
whose frontmatter carries `async-iteration` or `Symbol.asyncIterator` stay
outside the reviewed subset, and running them records 544 passes, 307 expected
negatives, 2,669 unsupported profile features, 39 semantic failures, and 8
harness failures. Sixty-eight percent of the unsupported group reports the one
diagnostic asynchronous generator method definitions already get, so promoting
that group belongs to the unit that admits generator methods rather than to a
classification pass. Every one of the 544 passes is a
*test/language/statements/for-await-of/* case, and those 848 classifiable
paths are generated destructuring cases whose reviewed dependency tags depend
on the shared destructuring case rather than on the host; promoting them needs
a tag derivation validated against the 379 for-await-of entries already
reviewed, which this unit does not attempt.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*PLAN-BIGINT.md*](./PLAN-BIGINT.md), [*PLAN-DYN.md*](./PLAN-DYN.md),
[*PLAN-NIO.md*](./PLAN-NIO.md),
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
unsupported profile feature, harness failure, or infrastructure failure.
Harness failures identify defects in the adapter or harness. Infrastructure
failures identify host, process, toolchain, or temporary-storage failures.
Unsupported, harness, and infrastructure results never increase the pass
count. A newly supported feature moves tests from unsupported only after every
applicable variant executes. A changed upstream revision is a reviewed
manifest change, not an automatic percentage update.

The reviewed subset and the partitioned result manifest describe the same set
of paths. *results.yaml* indexes the sorted path-group partitions and carries
their derived summary. Adding an entry to one side without regenerating the
other is not a state the repository holds, even briefly, because the gate then
fails while every count still looks healthy.

Measured compatibility moves in one direction. An upstream path recorded as a
pass does not move to another classification, the reviewed subset does not lose
a path, and a generated domain does not lose a seed or shrink its case budget.
The edition and profile boundary below states the matching rule for the
profile itself.

A change may still reverse one of these when the evidence demands it, such as
an upstream revision that withdraws a test or a defect that shows a recorded
pass was wrong. It records the reversal and its reason in the same change.
Reaching a green gate is not such a reason. That distinction is the whole
point: weakening a measurement and improving an implementation are
indistinguishable in a diff, and only the recorded reason separates them.

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

[*PLAN-BIGINT.md*](./PLAN-BIGINT.md) owns the exact literal, `ToNumeric`, value
representation, operator, assignment, and update contracts that cross this
stream and the built-in stream. BigInt remains outside the active profile until
an admitted unit has generic semantics and representation evidence; the
existing `Number` operators do not become BigInt behavior through implicit
conversion.

Array literal spread is complete for object iterables. Its generated property
suite uses seed `0x60000500`, compares an independent accumulation model with
Node.js, Deno, and both native specialization policies, and forces collection
on the enabled path. Five reviewed test262 cases pin iterator acquisition and
step failures. Call argument spread now uses a rooted dynamic argument list and
preserves target-first, left-to-right evaluation without `IteratorClose` on
spread failures. Constructor argument spread shares the list while evaluating
its callee before arguments and allocating the receiver only after accumulation
succeeds. The generated property suite uses seed `0x60000900` across intrinsic,
method, and dynamic calls and ordinary construction, both native specialization
policies, and forced collection. Native fixtures also cover `Promise`
construction. Ten reviewed test262 cases pin iterator acquisition and step
failures across calls and construction.

Standalone `const`, `let`, and `var` array binding declarations now own
recursive parser-independent patterns. Their lowering evaluates the initializer
once, steps from left to right, applies defaults only to `undefined`, drains
rest elements, and closes a non-exhausted iterator on normal or abrupt pattern
completion. The generated property suite uses seed `0x60000400`, compares an
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
fresh object. The generated property suites use seeds `0x60002000` and
`0x60002200` across ordinary, primitive, and nullish inputs, static and
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
`finally`. The generated property suite uses seed `0x60000a00` across array
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
cleanup. The generated property suite uses seed `0x60001700` across array and
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

The generated property suite uses seed `0x60001300` across both pattern
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
`0x60002600` across both pattern families, present, missing, and nullish inputs,
absent, truthful, and false JSDoc hints, both native specialization policies,
and forced collection. Name-based JSDoc hints remain on their pattern binding
through owned syntax and HIR, while the hidden aggregate ABI parameter remains
unhinted. Fixed native fixtures retain nested defaults and rest, arrows,
constructors, parameter temporal dead zones, iterator cleanup, and function
length. Four reviewed test262 cases pin array values, nesting, defaults, rest,
and abrupt completion.
Synchronous top-level default parameters use the same parameter environment
and retain JavaScript function length separately from the ABI parameter count.
The generated property suite uses seed `0x60000d00` across supplied and missing
values, both specialization policies, and forced collection. Fixed evidence
retains explicit `undefined`, null, prior and later references, body isolation,
abrupt initializers, constructors, arrows, identifier hints, function-name
inference, and function length. Five reviewed test262 cases pin fallback
selection, prior references, and length. Synchronous top-level rest parameters
retain an explicit HIR and MIR marker, and the C backend copies every remaining
generic call argument into a fresh array. The generated property suite uses
seed `0x60002900` across zero to three fixed parameters, bounded argument
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
property suite uses seed `0x60002700` across default, array-pattern,
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
of throwing from the call. The generated property with seed `0x60002600` now
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
without creating cells. The generated property suite uses seed `0x60001000`
across identifier and member targets, array and object patterns, present,
missing, and nullish inputs, both native specialization policies, and forced
collection. Fixed native fixtures retain expression-result identity,
function-name inference, member-reference order, step failure without close,
target failure with close, and computed-key suppression for nullish source
inputs and member bases. Await inside a member target remained unsupported at
this unit until M5a Unit 8.3 gave it an owned suspension position.
Fourteen reviewed test262 cases pin identifier and member writes, nested
patterns, defaults, rest, result identity, nullish and immutable-target errors,
and function-name inference under both strictness and specialization policies.

Synchronous `for-of` assignment heads now accept the same recursive array and
object patterns. Each outer step writes existing identifier or member leaves
without creating cells. Defaults, nesting, rest, nullish failure, immutable
target errors, and member-reference evaluation reuse standalone destructuring
assignment. A pattern failure closes any active inner array iterator before
closing the outer `for-of` iterator. The generated property suite uses seed
`0x60001600` across array and object patterns, identifier and member targets,
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
on the taken write path. Plain `=` assignment to a computed member likewise
retains the raw key and converts it only after the right operand, as `PutValue`
specifies. Logical assignments lower through explicit branches,
so their short path skips the right operand, second conversion, and write.
Anonymous functions on taken logical-assignment paths retain inferred
identifier names, while property targets remain unnamed. Imported and
immutable targets preserve their catchable write errors after the right operand
has run.

The generated property suite uses seed `0x60000c00` across all 15 operators,
identifier and member targets, bounded numeric inputs, nullish values, both
native specialization policies, and forced collection. Its independent model
also predicts member-reference and right-operand counts. Fixed native fixtures
retain every operator, expression results, logical short-circuiting, computed
property references, observable read and write key conversions, identifier
function-name inference, and immutable failure. Forty-two reviewed test262
`for-of` binding cases now pass because their `+=` loop bodies use the same
lowering. An ordinary asynchronous function now retains the reference and
already-read target value across suspension. Module top level uses its private
traced frame for the same position; only the pattern-position module await gap
recorded below remains.

Prefix and postfix update expressions now accept `++` and `--` on existing
identifier and static or computed member targets. Each form reads the target
once, applies `ToNumeric` before adding or subtracting the matching numeric one,
performs one checked write, and returns the assigned value for a prefix form or
the coerced previous value for a postfix form. M5a Unit 8.1a extends this path
to exact BigInt values while preserving the established reference, conversion,
write, and abrupt-completion order. [*PLAN-BIGINT.md*](./PLAN-BIGINT.md) records
the representation and generated evidence.

A member target evaluates its object and property-key expression once. The raw
key value converts for the read and converts again for the write, so the two
conversions may select different properties. Immutable binding failure occurs
after operand coercion and retains the resulting side effects. The generated
property suite uses seed `0x60002e00` across both operators, both result forms,
identifier and member targets, numbers, numeric strings, booleans, and null.
It compares an independent model with Node.js, Deno, both native
specialization policies, and forced collection. Fixed native evidence retains
all four forms, negative zero, infinities, `NaN`, object and key evaluation
counts, distinct read and write key conversions, key-conversion suppression for
a nullish base, and immutable-target failure. Four reviewed test262 cases cover
the four forms across whitespace boundaries, two parse negatives retain the
strict `arguments` early errors, and the admitted classic `for` update promotes
one existing exponentiation case to pass.

M5a Unit 8.1b admits `delete` for identifier, non-reference, ordinary member,
and optional-chain operands. Resolved declarative identifiers return `false`
without reading their cells, unresolvable names return `true`, and dynamic
`with` bindings delete the selected object property. Strict identifier
deletion remains an early error. Non-reference operands run their effects and
abrupt completion before returning `true`. A nullish optional guard returns
`true` without evaluating computed keys or later chain steps; a live chain
deletes its final property reference. Ordinary and optional member deletion
preserve property attributes, strict failure, result booleans, and the
specified key evaluation and conversion order.

The directly generated property suite uses ordinary seed `0x60000f00` with 16
cases. The repository extended gate uses seed `0x5eed0003` and scales that
budget to 160 cases. Its structured domain and independent oracle cover all
four operand families, both Script modes, static and computed keys, live,
initial-nullish, and intermediate-nullish bases, effects, abrupt completion,
false hints, a deliberate guard miss, both specialization policies, and forced
collection. Fixed Node.js, Deno, and native fixtures retain the same
boundaries. Twenty-six new reviewed
test262 cases pass and two strict identifier cases are expected parse
negatives, moving the manifest from 4,174 to 4,202 cases. Private-name deletion
remains an early error. `super` property deletion and runtime-owned intrinsic
identifier deletion remain source-located invalid boundaries until their
runtime reference behavior can be admitted completely. Top-level non-strict
Script `delete arguments` is an unresolvable-reference delete and returns
`true`; an admitted ordinary function resolves its implicit object and returns
`false`. The source-located invalid boundary applies only inside function forms
where this profile deliberately omits that object, including asynchronous
functions. Strict identifier deletion remains an early error. A hidden `with`
fallback allocated by an unresolved assignment cannot be deleted until the
global-object model owns its lifetime, so that combination is rejected rather
than returning a stale cell.

M5a Unit 8.1c admits the object-literal noncomputed colon-form `__proto__`
prototype setter. An object or null value replaces the fresh literal object's
`[[Prototype]]`; every other primitive is evaluated and ignored without
creating an own property. The setter retains its source position, value
effects, abrupt completion, and collector roots. It does not infer
`"__proto__"` as the name of an anonymous function used as its value.
Computed, shorthand, method, getter, setter, and spread definitions remain
ordinary own properties, and their source-order replacement behavior is
unchanged. A second colon-form prototype setter is a parse-time `SyntaxError`,
including when quoted and separated from the first by permitted ordinary
`__proto__` forms.

The directly generated property suite uses seed `0x60002101` with 16 cases.
Its independent oracle covers null, object, and primitive prototype values,
all four definition positions, every permitted ordinary `__proto__` form,
inherited reads and writes versus own descriptors, effects, abrupt completion,
a false number hint and deliberate guard miss, both specialization policies,
and forced collection. A second generated suite uses seed `0x60002102` to
retain the duplicate early error across both specialization policies. Fixed
Node.js, Deno, and native fixtures cover the same boundary, including forced
collection and the AArch64 Linux cross-link.

This unit advances the runtime ABI to `m5-37`. It adds
`oseo_object_literal_set_prototype`, which filters primitive prototype values
before delegating object and null values to the existing prototype-mutation
authority.

The reviewed test262 subset adds the directly applicable duplicate-setter parse
negative. The positive upstream cases also require `Object` reflection,
`Object.prototype`, or object-method `super`, so they remain outside this unit
instead of borrowing partial results. The manifest moves from 4,202 to 4,203
cases and from 1,169 to 1,170 expected negatives. Its 2,474 passes and 559
unsupported profile features do not move. The suite revision, inventory
policy, manifest schema, and classification vocabulary do not change, and
there are no semantic or harness failures.

M5a Unit 8.1d admits `this` at the top level of both source kinds. Owned
syntax records the this mode of every `this` expression, so an arrow carries
the mode of the position it is written in instead of a mode of its own. Script
top level and any non-strict function share a global this environment that
resolves a nullish receiver to the realm's global this value; a strict
function, including every class element, keeps its call-site receiver
unchanged. Module top level and an arrow beside it lower to the `undefined`
constant a Module Environment Record binds, while an ordinary function in the
same module still reads its own receiver. `this` remains an invalid assignment
and update target.

The receiver model is the smallest one that makes these positions correct. The
runtime creates one ordinary extensible object with a null `[[Prototype]]` on
first use, the same way it creates an object literal, roots it permanently, and
returns it for every nullish receiver.

Its own properties are the Script bindings GlobalDeclarationInstantiation
creates on the global object, and nothing else: every top-level function
declaration in source order, then every hoisted `var` name no function
declaration already owns. The frontend reports those names, HIR resolves each
to the binding the script statement list already writes, and the backend
installs the list once in the script prologue, after every binding cell exists
and before the first statement runs. Each property stores the binding cell
itself, so the property and the binding are one storage location: a binding
write, a property write, and a closure read all reach the same value, and no
value is copied between them. Each is writable, enumerable, and
non-configurable, and `Object.defineProperty` owns the `[[Writable]]` attribute
that the binding's own assignment path then observes. Lexical top-level
declarations are absent, a name declared inside a function is absent, and
module code adds nothing at all.

The global object is still not admitted. `globalThis`, the standard globals,
indirect `eval` var bindings, Annex B block-level function hoisting, and the
restricted-global and non-extensible cases stay M5b work, and reviewed cases
that need them keep their unsupported classification. Owned syntax records
which declaration creates each property, because that is what decides whether
this unit's uniform writable, enumerable, non-configurable property is the one
ECMA-262 creates. It is, for a function declaration over a replaceable
intrinsic such as `Symbol` or `TypeError`, whose property is configurable and
is therefore redefined whole. Every other collision with an intrinsic global
needs CreateGlobalVarBinding to leave the existing property untouched or
CanDeclareGlobalFunction to throw a `TypeError`, so it takes a source-located
diagnostic at the HIR boundary rather than a property that silently differs.
Three further boundaries are named in the profile rather than left implicit: a
block-level function declaration at Script top level has no var-scoped
binding, so it is absent from the global object where ECMA-262's Annex B would
bind it; property creation order follows ECMA-262's functions-before-vars
rather than the source order both reference hosts produce, because they share
V8; and a lexical top-level declaration of a restricted global is not reported,
because HasRestrictedGlobalProperty needs the lexical names this unit's
frontend contract does not carry.

The directly generated property suite uses seed `0x60002c0c` with 32 cases.
Its independent oracle names the binding each position observes and its domain
holds fifteen positions across Script and module sources, a Script strict
directive, arrows, ordinary, own-strict, generator, asynchronous, and
parameter-default functions, object and detached methods, class instance
methods, static methods, and fields, a detached class method, a module
continuation resumed after top-level await, an absent, `var`, function, or
lexical top-level declaration observed through the captured receiver, a false
number hint whose guarded addition misses into the compiled generic fallback,
both specialization policies, and forced collection. A strict indirect `eval`
gets its own variable environment, so the generated Script directive appears
only beside a declaration the global object never binds. The 32-case budget
samples thirteen of the fifteen positions and all four declaration kinds at
this seed, and the extended budget reaches all fifteen positions, so the object
method and the parameter default are not left to sampling: the fixed Script,
strict Script, and module fixtures pin them at both budgets. Those fixed
Node.js, Deno, and native fixtures retain the same boundaries, including the
AArch64 Linux cross-link. A fixed native scenario compares a Script and a
strict Script against ECMA-262 expectations for the declaration order,
descriptors, deletion, and `[[Writable]]` interaction that indirect `eval`
cannot reproduce, and the reviewed C heap fixture retains the global this
value's identity and reachability across a forced collection and pins the
property cache's cell-backed exclusion.

This unit advances the runtime ABI to `m5-38` with `oseo_this_value`,
`oseo_global_object_create`, and `oseo_global_binding_set`. The first resolves
a nullish receiver, the second installs one Script's global-object properties
from existing binding cells, and the third owns the `[[Writable]]` check a
shared storage location carries, so generated C never decides which receiver a
position observes or whether an assignment through a binding is admitted.
Because a fixed-slot property load would hand generated code the binding cell,
the property cache excludes cell-backed slots individually and keeps working
for the global object's ordinary properties.

The reviewed test262 subset adds twelve directly applicable cases: three
positive top-level `this` cases and the nine parse negatives that keep `this`
an invalid assignment, update, and binding target. Four already reviewed cases
move from unsupported to pass because a top-level `this` was their only
missing prerequisite, including the two class private-field
computed-property cases whose bodies begin `const self = this`. The manifest
moves from 4,203 to 4,215 cases, from 2,474 to 2,481 passes, and from 1,170 to
1,179 expected negatives, and unsupported profile features fall from 559 to
555. The suite revision, inventory policy, manifest schema, and classification
vocabulary do not change, and there are no semantic or harness failures. Every
one of those 4,215 classifications was re-observed against the global-object
binding model and none moved, so the model changes no already reviewed case.

The counts remain a floor, because the directly applicable
*test/language/global-code/* directory is still outside the reviewed subset
and is reviewed into it before this unit closes. Direct execution of its 42
inventory paths already separates them: *decl-var.js*, *decl-func.js*,
*decl-lex-deletion.js*, *S10.1.7\_A1\_T1.js*, and *S10.4.1\_A1\_T1.js* pass on
the model as it stands; the `new.target`, `super`, top-level `return`, and
module-syntax cases are parse negatives; and the rest need capabilities this
unit does not claim, including `$262.evalScript`, `hasOwnProperty`, Annex B
block-level function hoisting, `yield` as an identifier, and resolution of an
undeclared global name. Promoting them needs the per-case dependency review
the subset requires, not this unit's implementation.

M5a Unit 8.2 reconciles the remaining `super` and `new.target` profile claims
with Units 6.6 and 6.7. Arrows already capture the enclosing function's
`super()` constructor context, home object, and `new.target`; asynchronous
class elements already carry their home object; and each `super()` call already
constructs a fresh receiver before `BindThisValue`. This unit admits the one
remaining M5a form, an optional call through a `super` property. The lookup
keeps the home object's prototype separate from the derived receiver, guards
the resulting method value, skips arguments for a nullish value, and calls a
present method with the derived receiver.

The existing lexical-super property uses seed `0x60001e00`, and the optional
call property uses seed `0x60001e01` across one to three nested arrows, literal
and side-effecting computed keys, and present and absent methods. Both
properties run under
both specialization policies with forced collection against independent
bounded-integer models, Node.js, Deno, and native execution. Fixed native
fixtures add
optional calls in synchronous and asynchronous class elements and distinguish
fresh `Construct` from receiver reuse with a parent that publishes each
receiver and installs a private element. The reviewed optional-super-call
test262 case moves from unsupported to pass. The manifest stays at 4,215 cases
and moves to 2,482 passes, 1,179 expected negatives, and 554 unsupported
profile features with no semantic or harness failures. A `super` property
reference in a class without `extends` or an object-literal method remains M5b
work because its lookup needs a materialized `Object.prototype`.

Ordinary asynchronous functions and asynchronous arrows now use the traced
suspension record already owned by asynchronous generators instead of recursive
frontend continuation functions. Their calls still expose only one capability
promise, while the hidden frame retains locals, roots, expression temporaries,
and pending completion records across every admitted `await`. Fulfillment
resumes with a value and rejection resumes with a throw completion, so nested
operands, calls, compound member assignments, loop positions, and `try`,
`catch`, and `finally` preserve ordinary evaluation and completion precedence.
Promise reaction construction and dispatch remain centralized under
[ADR 0022](./docs/adr/0022-async-context-boundary.md); module suspension
remains a separate unit.

The generated property suite uses seed `0x60000600` across six expression
position families, fulfillment and rejection, ordinary functions and arrows,
truthful and false hints, both native specialization policies, and forced
collection. Its independent model is compared with Node.js, Deno, and native
execution. Fixed native fixtures additionally retain loop positions, nested
cleanup, heap locals, deliberate guard misses, and the generic fallback.
Fourteen reviewed test262 cases move from unsupported to pass, covering
expression positions, asynchronous method parameters, asynchronous generator
request ordering reached through an ordinary asynchronous callback,
`try`/`finally` completion precedence, and non-promise thenable assimilation.
The last case uses the unit's narrow `%Array.prototype.push%` dependency, whose
generic body preserves ordered strict writes, abrupt completion, accessors, and
array length semantics. Binding-pattern subexpressions retained their explicit
suspension restrictions at this unit until M5a Unit 8.3 removed them, and
asynchronous module cycles remain outside this unit.

M5a Unit 7.5 moves `for await` iterator steps inside ordinary asynchronous
functions and asynchronous generators, plus asynchronous generator `yield*`
next, return, and throw delegation steps, through the traced frame those bodies
already own. A step starts a promise-producing runtime operation, saves its
promise and direct-value mode in traced root slots, and returns to the caller.
Fulfillment or rejection resumes the saved block before generated code
inspects the iterator result. Queued jobs and timer turns retain their
observable order, while a promise that never settles now leaves the enclosing
operation pending instead of producing `OSEO3001`.

The Async-from-Sync wrapper builds its continuation promise with an internal
fulfillment reaction, so the stepped value and the outer iterator result await
also leave no suspended native stack. Fixed native fixtures cover caller
return, reaction and timer order, next, return, and throw delegation, a false
number hint with a deliberate generic fallback, forced collection, and a
never-settling step, and `for await` inside an asynchronous generator with a
`yield` and return resumption while its iterator remains open. The generated
property uses seed `0x60001201`, an independent schedule model, both iterator
sources and all three framed forms, both specialization policies, false hints,
reaction, timer, and never settlements, and forced collection against Node.js,
Deno, and native execution.

The reviewed *yield-star-return-then-getter-ticks.js* test262 case enters as a
pass. The manifest moves to 4,000 cases: 2,352 passes, 1,128 expected
negatives, and 520 unsupported profile features with no semantic or harness
failures.

M5a Unit 7.6 moves `AsyncIteratorClose` through the owning traced frame for
abrupt `for await` completion in ordinary asynchronous functions and
asynchronous generators. It also moves the missing-`throw` close of native
asynchronous `yield*` delegation through the asynchronous generator frame. A
start operation records the close promise and completion mode in traced roots;
fulfillment or rejection resumes generated code, which restores the saved
completion with the required precedence. A close promise that never settles
therefore leaves the enclosing operation pending instead of producing
`OSEO3001`.

AsyncFromSyncIteratorContinuation now installs a rejection reaction when
`closeOnRejection` applies. The reaction closes the wrapped synchronous
iterator before rejecting with the original stepped-value reason; failures
from that close do not replace the original rejection. Fixed native fixtures
cover reaction, timer, rejection, non-object, and never-settling close results,
abrupt completion precedence, native asynchronous and wrapped synchronous
missing-`throw` delegation, and synchronous stepped-value rejection. The
wrapped synchronous missing-`throw` path performs `IteratorClose` without
reading or awaiting the close result's fields. Generated properties use seeds
`0x60001202` and `0x60001203`, structured close and wrapper domains, independent
completion models, both specialization policies, false hints, deliberate
generic fallback, and forced collection against Node.js, Deno, and native
execution.

Five reviewed *AsyncFromSyncIteratorPrototype* cases and
*iterator-close-non-throw-get-method-is-null.js* enter as passes. The manifest
moves to 4,006 cases: 2,358 passes, 1,128 expected negatives, and 520
unsupported profile features with no semantic or harness failures. Module
top-level `for await`, top-level await checkpoints, and asynchronous module
cycles retain the Unit 7.7 module-continuation boundary.

M5a Unit 7.7 gives each directly asynchronous source module one private traced
continuation. Top-level await plus `for await` step and close operations now
save their roots and completion state in that frame, return to the graph
caller, and resume only from their queued reaction. The outer native event loop
owns entry-promise settlement and the `OSEO3001` no-progress decision, so a
module suspension does not drain unrelated work on its native stack.

The module scheduler admits asynchronous strongly connected components. A
module waits for already-visited members of its own component, ignores its DFS
back edge, and maps dependencies from outside a completed asynchronous cycle
to that cycle's root promise. Canonical URLs still select one evaluator and one
set of live cells. Dependency order, independent sibling progress, promise-job
FIFO order, rejection propagation, and deterministic shutdown remain graph
contracts. Static WebAssembly imports retain the separate host-integration
boundary in [*PLAN-WASM.md*](./PLAN-WASM.md); this unit does not introduce a
non-source graph node.

Fixed native fixtures cover dependency and cycle scheduling, canonical aliases,
one evaluation, live cells, caller return, spread-prefix retention,
fulfillment, rejection, never-settling step and close promises, abrupt close
precedence, both specialization policies, a false number hint with a deliberate
guard miss, and forced collection. The generated property suite uses seed
`0x60001f00`, a
structured two-to-four-node asynchronous SCC, non-root observer, and
sibling-schedule domain, an independent ordering oracle, eight ordinary cases,
replay metadata, and forced collection under both specialization policies. The
reviewed
*module-import-resolution.js* test262 case moves from unsupported to pass. The
manifest remains at 4,006 cases and moves to 2,359 passes, 1,128 expected
negatives, and 519 unsupported profile features with no semantic or harness
failures. Pattern-position await, `PromiseResolve` constructor semantics,
Async-from-Sync throw and iterator-result gaps, and M5b intrinsics remain
outside this unit.

M5a Unit 8.3 admits `await` inside the three pattern subexpressions the
frontend rejected everywhere: the object and computed key of an assignment
target member, a computed binding property name, and an array or object binding
default. The admission covers every body that owns a traced suspension frame,
which is an ordinary asynchronous function, an asynchronous arrow, and an
asynchronous generator, and every pattern that reaches one: standalone
declarations, destructuring assignment, catch parameters, classic `for`
declaration heads, and `for-of`, `for-await-of`, and assignment heads.

The unit adds no lowering. A pattern already lowers into the enclosing body,
and every MIR value of that body occupies a root slot of its frame, so the
acquired iterator, its captured `next` method and done state, a prepared
assignment reference, an object pattern's coercible input, and a rest
property's excluded keys already survive suspension and stay reachable by the
collector. What the unit removes is the frontend rejection that kept those
positions from reaching the machinery, together with the stale claims the
rejection supported.

Evaluation order and abrupt completion are unchanged by the suspension. A
target's object and computed key still evaluate before the step or read that
selects the stored value, and the raw key still converts after that selection.
A default still evaluates only for `undefined`, so a supplied value never
reaches a rejected operand. A rejected operand raises its throw completion at
the `await` position, an unfinished array-pattern iterator closes exactly once
before that completion leaves the pattern, and a done iterator is not closed
again.

Module top level keeps a source-located rejection for the same positions. Its
private traced frame can suspend an ordinary expression or control-flow
position, but module graph compilation rejects these pattern positions before
constructing that frame. That residue stays with the modules and asynchronous
execution stream. The module-owned follow-up must also replace the adjacent
stale compiler comment, which attributes this rejection to the continuation
transform, with this traced-frame rationale.

The generated property suite uses seed `0x60002800` across four pattern
positions, three body forms, supplied and missing selections, fulfilled and
rejected operands, and truthful or false hints, with an independent oracle that
predicts order and completion from the case record alone, both specialization
policies, and forced collection. Fixed native fixtures cover member-target and
source-key order, taken and skipped defaults, nested patterns, rest exclusions,
assignment cell identity, captured per-iteration lexical and hoisted `var` loop
cells, loop heads, one close of an unfinished iterator, a done iterator
that is not closed, rejected keys and targets, `finally` precedence, a catch
parameter, an asynchronous generator that mixes `await` and `yield` in the same
positions, and a deliberate guard miss reaching the generic fallback.

An AST scan of all 47,381 candidate paths finds `await` inside a pattern in
seventeen upstream cases, and every one is module code or a parse negative for
function parameters, so no reviewed case can promote to pass here. Three of
those parse negatives enter the reviewed subset as executable boundary
evidence: they pin that the admission reaches neither an asynchronous arrow's
nor an asynchronous generator's formal parameters, and that the module Await
capability does not propagate into a nested function's parameters. The one
module positive, *top-level-await/syntax/catch-parameter.js*, enters as
inventory evidence only; its declared `dynamic-import` feature stops it before
compilation, so it never reaches the module pattern-await diagnostic. The
compiler tests in *packages/parser-babel/tests/bindings.test.ts* and
*packages/compiler/tests/modules.test.ts* are what prove that diagnostic and
its location. The manifest grows to 4,219 cases and stays at 2,482 passes,
with 1,182 expected negatives and 555 unsupported profile features and no
semantic or harness failures.

M5a Unit 8.4 closes the reviewed
*AsyncFromSyncIteratorPrototype/throw/iterator-result.js* gap with targeted
differential evidence for a throw forwarded through the async-from-sync
wrapper to a synchronous generator. Tracing that forwarding found two real
defects rather than an evidence gap. The runtime's virtualized
`%GeneratorPrototype%.throw` had no context cache slot of its own, so its
lookup fell through to the `[Symbol.iterator]` self function's slot and
whichever method a program resolved first answered both keys afterward. Any
program that acquired a generator's iterator before delivering a throw
therefore called the self function instead of resuming the generator, which
is exactly the shape of the reviewed case, where the delegation's
GetIterator fallback reads `[Symbol.iterator]` before the wrapper forwards
the throw. The `m5-39` runtime ABI gives the throw method its own
permanently rooted cache field. The synchronous `yield*` lowering also
reported the wrong delegation result when a forwarded throw ended the
delegation: the shared exit read the `next` step's result slot, so a `throw`
result carrying `done` reported the last stepped object instead of its own
`IteratorValue`. The exit now joins through a block parameter each ending
step supplies, matching the asynchronous delegation's join.

Two fixed fixtures cover the repaired paths against Node.js, Deno, and
native execution under both specialization policies and forced collection: a
synchronous fixture that resolves the throw method before the program's
first `[Symbol.iterator]` read, forwards uncaught and caught throws through
`yield*`, and completes a delegation through a done `throw` result, and an
asynchronous fixture that forwards a throw through the wrapper to a
synchronous generator, observes the rejection reason's identity, and then
observes the completed state of both iterators. The defect domain is a fixed
method-identity and join-value fault, so no new property suite is added; the
existing generator throw-resumption and delegation suites keep their seeds
and domains. The reviewed case enters as a pass, and the manifest grows to
4,220 cases: 2,483 passes, 1,182 expected negatives, and 555 unsupported
profile features with no semantic or harness failures.

M5a Unit 8.5a admits the multi-declarator `const` and `let` declaration list.
The frontend previously rejected every lexical declaration with more than one
declarator, which made an ordinary line such as `let probe1, probe2;`
unsupported and blocked reviewed cases that only use the form in a prelude.

The unit adds one owned syntax node and no lowering. A declaration list is
kept as one `declaration-list` statement whose members are the same
declarator shapes a one-declarator statement already produced, and HIR
construction expands those members into the statement list that contains the
declaration. That expansion is the whole semantic decision. ECMAScript admits
a lexical declaration only where a StatementList is admitted and gives its
declarators the scope that contains them, so the existing per-scope
predeclaration pass already gives the whole list one temporal dead zone, one
duplicate-name check against its siblings and its enclosing scope, and one
set of cells. Wrapping the declarators in a block instead, which is what the
`var` path does for its assignment list, would have created a lexical scope
the source does not have: MIR resets the lexical cells a block declares on
entry, so the same names would be reset twice and a closure made between the
two resets would observe a different cell. The compiler rejects a
declaration list that reaches a single-statement position with a
source-located diagnostic, which pins the owned-syntax contract that the
grammar cannot produce one there.

Two owned-syntax consumers besides HIR construction see the node, and nothing
after HIR construction does. The module frontend's `exportForDeclaration`
returns one export entry per bound name, because ExportedNames of an export
declaration is the BoundNames of the whole declaration, and the module
compiler's duplicate-declaration diagnostic searches a list's declarators so
that it names the declarator rather than the whole module. Because the list is
gone before HIR exists, module evaluator construction, the traced asynchronous
frame, the specialization passes, and the C backend keep working on the same
statements they already lowered, so awaited declarators,
per-iteration loop cells, and both specialization policies follow from the
existing machinery rather than from new code.

Two invariants the grammar guarantees are kept unrepresentable or checked
rather than assumed. The declarator field is a tuple of at least two members,
because a one-declarator declaration stays the declarator statement it has
always been, and HIR construction rejects a list that mixes `const` and `let`
declarators with a source-located diagnostic, because one LetOrConst covers a
whole BindingList and a mixed list would have no mutability to resolve. The
rejected list still predeclares its declarators, each with the mutability its
own declarator asks for, so the one diagnostic the list deserves arrives
without an unknown-binding diagnostic for every later reference to a name it
was meant to bind.

Evidence is one native fixture for the semantics, one for the hint, one for
suspension, and one generated suite. The fixtures cover left-to-right
ordering, a direct and a closure-mediated read of a later name, an abrupt
declarator that leaves the later names uninitialized in the captured scope,
mixed pattern and identifier declarators, iterator close order across two
patterns, an abrupt default that stops the declarators after it, fresh cells
per loop iteration, switch clauses, class static blocks, awaited declarators
in an asynchronous function, and a falsified `number` annotation on one
declarator of a list whose truthful sibling keeps hitting. All of them run
under both specialization policies with collection forced at every
safepoint. The generated suite uses seed `0x60001d00` and an independent
model over one `const` or `let` list of two to four declarators per case,
mixing plain, bare, array-pattern, object-pattern, and back-reading
declarators across five statement-list positions, with normal completion, an
abrupt declarator, a read of a later name, and truthful or false hints.

An AST scan of the 41,091 included candidate paths finds a multi-declarator
lexical declaration in 83 of them, two of which were already reviewed and
classified `unsupported-profile-feature` for exactly this rejection:
*statements/class/static-init-scope-lex-open.js* and
*for-await-of/async-gen-decl-dstr-array-elem-init-assignment.js*. Both now
pass. The reviewed subset grows by 112 cases drawn from
*language/statementList/*, *statements/let/syntax/*,
*statements/const/syntax/*, *statements/for/*, the two *fn-name-cover.js*
cases, and the *for-await-of* destructuring family whose generated preludes
declare several names in one `let`: 78 pass, 29 are the parse negatives that
keep a lexical declaration out of a single-statement position and reject a
`const` declarator without an initializer, and 5 are for-await-of cases whose
remaining prerequisites are the `arguments` object and `Object` as a value.
The two *cptn-value.js* cases stay outside the subset because they read the
completion value through `eval`, which
[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md) keeps outside the
profile. The manifest reaches 4,332 cases: 2,563 passes, 1,211 expected
negatives, and 558 unsupported profile features with no semantic or harness
failures.

Tracing the unit's own claim also invalidated a documented one. The profile
recorded an awaited initializer in a declaration list with more than one
declarator as a deliberate `var` rejection. Re-measuring every such form in
an asynchronous function and at module top level found all of them admitted,
so the profile entry drops the rejection instead of rewording it.

M5a Unit 8.5b admits the optional catch binding. The frontend previously
rejected every `catch` clause without a parameter, so the ES2019 form
`catch { ... }` classified as unsupported even though it exercises no new
runtime behavior. The owned syntax now represents the absent parameter
explicitly: the handler keeps its `pattern` field and spells absence as
`undefined`, so a frontend cannot omit the decision silently, and the
handler's range covers the catch clause when no parameter supplies one. HIR
construction resolves an absent-parameter handler without creating a
catch-parameter scope, which leaves the body block the owner of its own
lexical scope exactly as CatchClauseEvaluation observes, and it recovers two
malformed shapes an untyped custom frontend can build: a nullish pattern
normalizes to the absent parameter, and a handler without a body is a
source-located diagnostic instead of a crash. MIR lowering keeps emitting the
`caught` operation, because that operation both clears the pending language
error context and consumes the completion slot's thrown value; the absent
form simply leaves the value unused, so abrupt completion, `finally`
precedence, nested handlers, generator suspension inside the clause, and the
traced asynchronous frame reuse the lowering the parameterized clause already
proved. Parameterized catch semantics are untouched.

Evidence is one fixed native fixture, a new generated optional-catch domain,
and package tests written to fail first. The fixture covers body entry
for a discarded value including a thrown `null`, a skipped handler on
normal completion, `let`
shadowing inside the clause, fresh cells per repeated catch entry observed
through mutating closures, `var` hoisting out of the clause, `return` through
`finally` and a `finally` override, a rethrow reaching an outer handler after
the inner `finally`, labeled `continue` and `break` with per-iteration
`finally` observations, generator yields inside `catch` and `finally`, and an
awaited recovery value, all under both specialization policies with
collection forced at every safepoint. The pre-existing `0x60000a00`
catch-binding domain, array and object catch bindings with defaults, rest,
present, missing, and nullish inputs, is unchanged and keeps its reviewed
ten-case budget. A distinct new domain under seed `0x60002300` with its own
ordinary ten-case budget directly generates absent and destructured catch
handlers combined with rethrown handler completions, optional finalizers,
and present, missing, and nullish thrown inputs, so an absent handler runs
against the thrown `null` a pattern handler rejects while both handler kinds
order the handler body, the finalizer, and the function completion the same
way. Package tests pin the owned representation,
the bare `catch` HIR print, the discarded `caught` MIR shape, the distinct
shadowing cells, and both malformed-shape recoveries.

A textual scan of the 41,091 included candidate paths finds `catch` without a
parameter in seven of them: the five
_statements/try/optional-catch-binding\*.js_ cases, the
*statements/block/12.1-2.js* negative whose bare `catch {}` sits inside a
rejected statement sequence, and *statements/try/S12.14\_A16\_T6.js*, which
names the form only in its description while its tested source rejects
`catch ()`. All seven enter the reviewed subset. *optional-catch-binding.js*,
*optional-catch-binding-finally.js*, and *optional-catch-binding-throws.js*
pass in both strictness modes. *optional-catch-binding-parens.js*,
*statements/try/S12.14\_A16\_T6.js*, and *statements/block/12.1-2.js* are
expected parse negatives that keep `catch ()` and a catch-less `try {};`
rejected. *optional-catch-binding-lexical.js* classifies
`unsupported-profile-feature` because its final assertion reads the
unresolved global `y` through `assert.throws(ReferenceError, ...)`, which the
global binding model gap owns; the catch clauses it contains compile. The
manifest reaches 4,339 cases: 2,566 passes, 1,214 expected negatives, and 559
unsupported profile features with no semantic or harness failures.

M5a Unit 8.5c admits a simple catch parameter that shares its name with a
var-scoped declaration in the enclosing function, Script, or module. The
existing hoisting pass creates and initializes the outer var cell normally,
including when the only declaration appears inside the catch body. The catch
clause still creates a fresh cell for its parameter. A same-name `var`
declaration adds no catch-body binding, and its initializer resolves to and
writes the catch cell. After the clause, the outer cell therefore retains its
earlier value or the `undefined` supplied by hoisting.

The implementation narrows only the frontend's redeclaration check. A simple
identifier is omitted from the set of catch names that reject nested
var-scoped declarations; recursive array and object catch patterns keep the
existing restriction. Same-scope lexical declarations still fail during
parsing, and the block-level function restriction remains unchanged. This unit
does not add optional-catch behavior or Annex B function hoisting.

Fixed differential evidence covers non-strict Script code, strict and
non-strict ordinary function bodies, a real source module, generator and
asynchronous function bodies, closure identity, a same-name initializer that
completes or throws, `return` and generator-close completion through `finally`,
both specialization policies, forced collection, and the AArch64 Linux
cross-link. The rule has no useful generated value or state domain beyond the
fixed name and completion matrix, so this unit adds no property suite.

The reviewed subset adds
*test/language/statements/try/scope-catch-param-var-none.js* as fixed inventory
evidence. Its direct `eval` remains outside the admitted profile under ADR
0016, so the case is honestly unsupported rather than used as the same-name
positive. The fixed differential fixture supplies that positive evidence. The
manifest reaches 4,340 cases: 2,566 passes, 1,214 expected negatives, and 560
unsupported profile features with no semantic or harness failures. The suite
revision, inventory policy, manifest schema, classification vocabulary, and
every earlier classification remain unchanged.

M5a Unit 8.5d admits a block-level function declaration that shares its name
with a var-scoped declaration outside the block that declares it. ECMA-262's
Block early errors reject a name in the block's own LexicallyDeclaredNames
that also occurs in that same Block's VarDeclaredNames; because
VarDeclaredNames of a nested block already propagates into every Block that
contains it, that rule reaches a var declared in the block that declares the
function or in any block nested inside it before a function boundary, and
nowhere else. A var declared in a sibling block, in an ancestor block that
does not itself declare the function, or elsewhere in the same function,
Script, or module body sits outside that overlap and stays admitted without
Annex B.

The frontend's var-scoped hoisting pass previously reserved every block-level
function name across the whole enclosing var scope: a `blockFunctions`
accumulator collected every function name declared in any block anywhere in
the body, and any var sharing one of those names was rejected regardless of
where the var and the function actually sat relative to each other. That
accumulator is removed. The pass's existing lexical-frame check, which
already walks the exact chain of enclosing blocks a var declaration sits
inside and rejects a var that redeclares a lexical or function name from an
enclosing frame, is now the only check for this collision, and it already
implements the correct rule: a var only conflicts when it sits inside the
declaring block or a block nested inside it. No HIR or MIR change is needed:
`predeclareBindings` already gives a block-level function its own scope-local
cell, distinct from the hoisted `let` a var declaration becomes, so the two
cells were already distinct once the frontend admitted the coexistence.

Fixed differential evidence covers a strict function body's own block
function read through a closure formed inside the block, a sibling block
sharing an outer var's name, completion precedence through `finally`, a
generator body, a block-scoped generator declaration, an asynchronous
function body, and, in a separate module fixture compiled only for the
native target, a real source module. All function-body cases run under
both specialization policies with forced collection and the AArch64 Linux
cross-link; the module fixture is not part of that cross-link loop.
Sloppy-mode Script and function code exercise the identical construct, but
Node.js and Deno apply Annex B's web legacy compatibility semantics to it
in sloppy mode, hoisting the block's function value out to the outer var,
which this profile does not implement; a fixed native scenario pins the
ECMA-262 (non-Annex-B) expectation for that case instead of comparing a
host observation, following the same pattern the Script global-declaration
order already uses. The rule reduces to an existing block-ancestor
lexical-frame check plus the generic block-scope, hoisting, and closure
machinery every other unit's generated properties already exercise, so no
new generated value or state domain is added.

A scan of test262's `block-scope`, `eval-code`, `function-code`, and
`global-code` directories finds the reviewed subset's first cases naming a
block-level function declaration.
*test/language/block-scope/shadowing/lookup-from-closure.js* and
*dynamic-lookup-from-closure.js* were already admitted before this unit,
since a bare block-level function declaration was never rejected, and enter
the reviewed subset as passes.
*test/language/global-code/block-decl-strict.js* and
*test/language/function-code/block-decl-onlystrict.js* assert that a strict
block function's name resolves to a runtime `ReferenceError` outside its
block; the frontend instead resolves every binding statically and reports
the same absence as a compile-time diagnostic, which is a documented
profile boundary rather than a semantic gap this unit closes, so both enter
as `unsupported-profile-feature`. Three *test/language/eval-code/direct/*
cases exercise the identical construct through direct `eval`, which
[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md) keeps outside the
profile, and enter with the same classification. Six
*test/language/block-scope/syntax/redeclaration/* cases test the
same-block and ancestor-block conflicts the lexical-frame check must keep
rejecting. Five are named directly:
*var-name-redeclaration-attempt-with-function.js* and
*var-redeclaration-attempt-after-function.js* cover a var and function
sharing one block in both orders,
*fn-scope-var-name-redeclaration-attempt-with-function.js* nests that
conflict inside a function, and
*inner-block-var-name-redeclaration-attempt-with-function.js* and
*inner-block-var-redeclaration-attempt-after-function.js* nest it inside
an inner block in both orders. The sixth, whose identifier exceeds this
document's line length, nests a var two blocks under the function it
redeclares. All six enter as expected negatives. No test262 case in the
reviewed candidate set exercises the disjoint positive coexistence with a
runtime assertion, so the fixed native fixture and module fixture supply
that evidence directly. The manifest reaches 4,353 cases: 2,568 passes,
1,220 expected negatives, and 565 unsupported profile features with no
semantic or harness failures.

M5a Unit 8.5e admits a function declaration in a switch clause, closing the
one core-language boundary Unit 8.5d left for a later unit. ECMA-262 treats a
CaseBlock's FunctionDeclarations the same way BlockDeclarationInstantiation
treats a Block's: every one is instantiated once, in source order, when the
switch statement is entered, before CaseBlockEvaluation tests or reaches any
clause. Every clause already shared one lexical scope for `let`, `const`, and
class declarations; this unit gives that same scope's function declarations
their own CaseBlock-wide instantiation instead of leaving them for whichever
clause happens to run. The owned syntax and HIR extend `SyntaxSwitchCase` and
`HirSwitchCase`'s clause bodies to admit a function declaration the same way a
block's body already does, and HIR construction now hoists every clause's
function declarations into a shared `functionInits` list on the switch
statement itself, built by the same first-pass helper a block's own two-pass
statement-list resolution already used for its own body, so the two call
sites share one implementation rather than two copies. Each clause's
per-statement resolution then skips a function declaration where it appears,
matching a block's own second pass. MIR lowering resets every clause's direct
bindings to their temporal dead zone and then lowers the shared
`functionInits` list once, immediately after the discriminant is evaluated
and before the lazy, source-ordered case tests begin, so a function is
already a callable value no matter which clause the discriminant selects or
reaches through fallthrough, and no matter whether the clause that declares
it ever runs.

A duplicate name across two clauses of one CaseBlock is the same
LexicallyDeclaredNames duplicate early error an ordinary Block already
enforces. ECMA-262 exempts that error, for a repeated name bound only by
ordinary FunctionDeclarations in non-strict code, solely when the host
supports Block-Level Function Declarations Web Legacy Compatibility
Semantics (Annex B.3.2): the exemption is written as part of the
non-strict-mode duplicate rule itself, conditioned on that Annex B host
capability, not as an unconditional core rule. This profile's closed
ahead-of-time runtime does not implement that capability, or the outer
var-scoped copy-out Annex B.3.2 pairs it with, so a Block or CaseBlock in
this profile rejects a duplicate function name outright, regardless of a
matching ordinary kind or the code's strictness. A Script or FunctionBody's
own top-level function declarations follow a wholly different, unconditional
rule instead, unaffected by that capability either way: their
LexicallyDeclaredNames excludes function and var bindings entirely, so they
are hoistable, var-like declarations that any later declaration of the same
name freely replaces regardless of its kind or the code's strictness.
`predeclareBindings` is the one helper both rules share, predeclaring a Block
or CaseBlock's own scope and a Script or FunctionBody's top-level scope
alike, and its duplicate-function exemption did not distinguish them: it
treated any two function declarations sharing a name as exempt everywhere,
regardless of scope or kind, so a `function f` and a `function* f` inside one
switch statement were silently accepted with the second replacing the first,
the same way two top-level `function* f` declarations correctly are. This
unit gives `predeclareBindings` an explicit lexical-scope flag, true only for
a Block or CaseBlock's own call: a Block or CaseBlock now rejects every
duplicate function name, while a Script or FunctionBody top level keeps the
original unconditional exemption. The codebase's bootstrap Babel parser
still admits a duplicate ordinary FunctionDeclaration in a Block or CaseBlock
itself, because Babel assumes the Annex B.3.2 host capability applies by
default, matching ordinary browsers and Node.js; this profile's own
`buildHir` now rejects that same source on its own once conversion hands it
a syntax tree, so this half of the fix is evidenced by a set of tests that
compile Babel-parsed source through the full pipeline and observe the HIR
boundary's own diagnostic, alongside direct `buildHir` tests covering the
kind-mismatch and strict-mode cases Babel does still reject at parse time.
The corrected Script and FunctionBody exemption remains reachable through
ordinary compilation and is covered by a differential regression test
drawing on the existing top-level repeated-function-declaration evidence. A
module's top level shares neither rule: ECMA-262 gives ModuleItemList no
exception comparable to a Script's or a FunctionBody's, so a module's
top-level function declarations are LexicallyDeclaredNames like a Block's,
and a module is always strict, so no duplicate name is ever admitted
regardless of kind, matching a Block or CaseBlock exactly. `buildSeededHir`
now takes an explicit module-body seed flag that `module-compile.ts` sets
for a module's own top-level `predeclareBindings` call, so a module keeps
the CaseBlock-style lexical rule while a Script or a FunctionBody keeps the
unconditional one; this closes a gap Babel also happened to mask, since its
module parser already rejects a duplicate top-level function name outright,
so the fix is again evidenced by a direct `compileModuleGraph` test built
from an owned module body rather than by Babel-parsed source.

The var-scoped hoisting pass's existing `SwitchStatement` case in
`collectVarStatement` already treated a switch's case bodies as one lexical
frame that includes function names, in anticipation of this unit; once
function declarations reach that code path, the existing check already
implements the correct rule without change: a var inside the same switch
conflicts with a function any clause declares, while a var outside the
switch, sharing a switch-clause function's name, sits outside that frame and
stays admitted as a disjoint coexistence with its own distinct cell, the same
relationship Unit 8.5d already established for a block.

Fixed Node.js, Deno, and native differential evidence covers a function
declared in one clause and called through a different clause reached
directly or through fallthrough, a function declared in an earlier clause
read back after fallthrough into a later one, fresh per-execution function
identity captured by closures across loop iterations, a `let` in one clause
and a differently named function in another clause sharing the CaseBlock's
temporal dead zone, and generator, asynchronous, and asynchronous generator
switch-clause functions, none of which carry Annex B's web legacy
compatibility semantics in any strictness mode. Every case above runs as an
always-strict module fixture so it needs no Annex B accommodation on either
reference host. A duplicate function name in one CaseBlock is always
rejected in this profile, so it has no positive runtime behavior to compare
against a reference host; that rejection is instead covered directly by the
frontend and `buildHir` tests recorded above. Deno 2.9.2's TypeScript
transpile loses the CaseBlock-wide function instantiation for a forward
reference from an earlier clause to a function a later clause declares, the
same class of bug *switch-tdz.js* already documents for a case-level `let`,
so that one construct runs as a direct native fixture bypassing the Deno
reference instead, following the same pattern. Both specialization policies
and forced collection cover every fixture, proving a function object and the
closures that capture it stay reachable across a collection forced at every
safepoint and that a later switch evaluation's function keeps an identity
distinct from an earlier one's. A fixed sloppy-mode Script and function-body
scenario shows the var-coexistence positive without Annex B's copy-out,
matching *block-function-var-sloppy.js*'s established pattern: the
switch-clause function and the outer var stay distinct cells, so the outer
var is unaffected by the switch and a closure created inside the switch
still resolves the CaseBlock's own binding. The construct's admitted state
space reduces to the shared CaseBlock scope, hoisting, and closure machinery
already exercised by other units' generated properties, plus a small,
enumerable set of clause-selection and declaration-position combinations the
fixed fixtures above cover directly, so this unit adds no new generated
property suite.

The reviewed test262 subset promotes every included
_test/language/statements/switch/syntax/redeclaration/\*-with-function.js_
and _function-name-redeclaration-attempt-with-\*.js_ case: each is a
CaseBlock LexicallyDeclaredNames duplicate or a LexicallyDeclaredNames and
VarDeclaredNames overlap the bootstrap parser already rejects as a native
parse-time `SyntaxError`, so all fifteen enter as expected negatives,
including the ordinary function pair test262 reviews only in strict mode,
where this profile and every host agree regardless of Annex B support. Four
*scope-lex-async-function.js*, *scope-lex-async-generator.js*,
*scope-lex-class.js*, and *scope-lex-generator.js* cases, previously
unreachable while every function-kind declaration in a switch clause was
rejected outright, assert that the declared name resolves to a runtime
`ReferenceError` when read outside the switch; this profile instead resolves
every binding statically and reports the same absence as a compile-time
diagnostic, the same documented boundary Unit 8.5d records for a block-level
function, so all four enter as `unsupported-profile-feature` rather than
closing a semantic gap this unit owns. No test262 case in the reviewed
candidate set exercises the positive CaseBlock-wide instantiation or the
disjoint var coexistence with a runtime assertion, so the fixed native
fixtures and scenario above supply that evidence directly. The manifest
reaches 4,372 cases: 2,568 passes, 1,235 expected negatives, and 569
unsupported profile features with no semantic or harness failures.

A follow-up review found that `predeclareBindings`'s new `lexicalScope`
flag reached one caller too many. A parameter-environment function
(default or destructuring parameters) wraps its own FunctionBody in a
synthetic block so the body has a scope distinct from its separate
parameter scope; that wrapper is a Block in shape only; it carries no
source block of its own. `resolveStatementList`'s “block” branch could
not tell the two apart, so it predeclared a parameter-environment body's
top-level function declarations with the Block/CaseBlock lexical policy
instead of the FunctionBody's own var-like one, reporting a false
`Duplicate declaration` for code such as
`function outer(x = 0) { function f() {} function f() {} }` that a
simple-parameter or rest-only body already admitted. The owned syntax's
`block` statement gains a `parameterEnvironmentBody` marker the frontend
sets only on this synthetic wrapper, and `resolveStatementList` now takes
an explicit `lexicalScope` argument from its “block” caller instead of
assuming every block it predeclares is a genuine one, so the wrapper
keeps the var-like policy while a real nested block or switch inside a
parameter-environment body still rejects a duplicate function name.
Focused regression tests cover default, destructuring, rest, and simple
parameter forms admitting a duplicate ordinary or mismatched-kind
function name, a genuine nested block and a switch inside a
parameter-environment body still rejecting one, and the same contract
proven directly at the `buildHir` boundary. The manifest is unchanged,
because no promoted test262 case exercises a parameter-environment
function body.

M5a Unit 8.5f admits the ECMAScript `debugger` statement as an executable
no-op. DebuggerStatement's Evaluation is the same empty NormalCompletion an
EmptyStatement's already is in this profile, since the closed ahead-of-time
runtime implements no debugging facility for the statement to invoke; the
frontend's `statement` conversion function reuses EmptyStatement's own
established representation for it, converting a `DebuggerStatement` node to
the same `{ kind: "block", body: [] }` owned syntax rather than gaining its
own `SyntaxStatement` or `HirStatement` variant. Every later stage this
profile owns is either exhaustive over statement kinds and already
dispatches an empty block through its existing block case, or is a
permissive statement-kind scan that already treats an unrecognized kind as
inert; both keep working unmodified, so the whole boundary from
Babel-sourced syntax through HIR construction, MIR lowering, module
traversal, and the C backend needs no new case anywhere, matching the empty
statement's own reach. The statement is therefore admitted wherever
ECMA-262 admits any Statement: nested in a block, a loop body, a switch
clause, a labeled statement, a function, async function, generator, or
async generator body, and a module's top level, since every one of those
positions already converts its body through the same shared `statement`
function.

Focused parser tests compile a debugger statement in every one of those
positions and confirm the frontend, HIR, and MIR stages accept it with no
diagnostics, and a direct HIR assertion confirms it lowers to the identical
empty-block shape an empty statement already produces. A fixed
*debugger-statement* native differential fixture interleaves debugger
statements with observable `console.log` calls across a block, a while and
do-while loop, a classic for loop, a switch statement's clauses, an
if/else, a labeled loop, an ordinary function, a try/catch/finally, and a
suspended async function, generator, and async generator body, proving
source order, completion behavior, lexical scopes, and suspension and
resumption stay unaffected across both specialization policies and forced
collection. A debugger statement has no useful generated domain beyond the
enumerable set of statement positions the fixed fixture and parser tests
already cover directly, so this unit adds no new property suite.

The reviewed test262 subset promotes both included
_test/language/statements/debugger/\*_ cases: *statement.js* exercises the
positive `while (false) debugger;` form and enters as a pass, while
*expression.js* exercises `(debugger)` in an expression position, which the
bootstrap parser already rejects as a native parse-time `SyntaxError` since
`debugger` remains a statement-only keyword, so it enters as the expected
negative test262 already predicts. The manifest reaches 4,374 cases: 2,569
passes, 1,236 expected negatives, and 569 unsupported profile features with
no semantic or harness failures.

M5a Unit 8.5g admits the mapped arguments exotic object
(`CreateMappedArgumentsObject`, 10.4.4.7) for the non-strict function forms
that already receive the implicit `arguments` binding, when the formal
parameter list is simple. ECMA-262's `IsSimpleParameterList` excludes a
rest parameter, a binding pattern, and an initializer; the frontend
computes it once as `simpleParameterList` on `SyntaxFunction`, and
`resolveFunction` combines it with the existing `admitsArgumentsObject`
decision into a new `argumentsMapped` fact that HIR and MIR both carry
alongside the existing `argumentsBindingId`. FunctionDeclarationInstantiation
creates every declared parameter's binding cell before it creates
`arguments`, and the generated prologue already matches that order: it
creates every local binding's cell, including each parameter's, before
reaching the `arguments`-binding block. The backend uses that ordering
directly. For each formal parameter position that is the rightmost
occurrence of its name, duplicate non-strict parameter names already share
one binding cell in this profile, so no separate resolution step is needed
to find it, it emits that position and its binding id into two
compile-time arrays, and the new `oseo_mapped_arguments_create` runtime
entry point snapshots every supplied index exactly as the existing
`oseo_arguments_create` does, then, for each of those positions, replaces
the snapshot with the parameter's own environment binding cell as the
property's stored value.

Extending `cell_backed_property`, already shared by the global object and
a module namespace, with a new `mapped_arguments` object flag gives the
generic `oseo_object_get`, `oseo_object_set`, and
`Object.getOwnPropertyDescriptor` paths the two-way alias for free:
reading or writing a mapped index reaches the parameter's cell, and its
descriptor reflects the cell's current value. `oseo_object_define`'s
existing cell-backed redefinition branch gains the one behavior those
generic paths cannot express: 10.4.4.2 severs the alias exactly when the
accepted descriptor is an explicit non-writable data descriptor, and
`oseo_object_define_accessor`'s existing unconditional
`property->value = undefined` on a redefinition to an accessor already
severs it as a side effect of code this unit does not change. Severing
replaces the property's own stored value with a plain snapshot of the
value just written instead of the cell, so a later `[[Get]]`/`[[Set]]` on
that index no longer reaches the parameter, while the parameter itself
keeps its own cell and stays an ordinary mutable binding regardless; the
runtime never touches a cell's own `writable` field for a mapped index,
which remains reserved for a global or namespace binding's own
`[[Writable]]` mirror. Deleting a mapped index needs no special case at
all: `oseo_object_delete` already just removes the configurable property,
and a removed property answers every later `[[Get]]` as absent whether or
not it once aliased a parameter. An index beyond the supplied argument
count, and a duplicate name's earlier, non-rightmost occurrence, are never
redefined to a cell, so they keep the plain snapshot every unmapped index
already receives; the existing unmapped `oseo_arguments_create` path, and
every non-simple parameter list that still selects it, are unchanged. The
runtime ABI moves from `oseo-runtime-m5-39` to `oseo-runtime-m5-40`.

A new HIR test asserts `argumentsMapped` is present only for a
non-strict, simple parameter list, and a companion MIR test confirms
`buildMir` threads it unchanged; both also confirm a rest parameter and a
strict function keep the existing unmapped or absent shape. A fixed
*mapped-arguments-object* native differential fixture covers two-way
aliasing through both a numeric and a string-keyed index, an index
beyond the supplied count, an absent parameter, a duplicate formal name
mapping only its rightmost occurrence, deletion, an explicit
non-writable redefinition whose omitted value defaults to the current
mapped value, and a redefinition into an accessor, plus fresh identity
and a mapped index's own descriptor, across both specialization policies
and forced collection. A second generated property with seed
`0x60000301` extends the M5 arguments-object model with one to three
simple parameters, an optional rightmost-name duplicate, zero to five
supplied arguments, a write/sever index, and every sever mode (none,
deletion, an explicit non-writable redefinition, and conversion to an
accessor), checked against an independent hand oracle alongside Node.js
and Deno references, both specialization policies, and forced
collection; the existing generated model now uses seed `0x60000300` and
retains its zero-parameter case, which exercises the mapped object's own
trivial, nothing-to-alias path.

The reviewed test262 subset promotes 41 of the included
_test/language/arguments-object/mapped/\*_ cases: they cover a mapped
index's own descriptor shape, non-configurable and non-writable
redefinition transitions taken in every order, severing through both
`[[DefineOwnProperty]]` and deletion, and conversion to an accessor. Four
candidates from this unit's own audit stay `unsupported-profile-feature`
for reasons outside it:
*mapped/nonconfigurable-descriptors-define-failure.js* reads `arguments`
from inside a nested arrow function, which this profile's arrows do not
lexically capture from their enclosing function, the same gap the
admitted-features entry above records; and
*unmapped/via-params-dflt.js*, *unmapped/via-params-dstr.js*, and
*unmapped/via-params-rest.js* each fail only because the shared
*assert.js*/*sta.js* harness itself reads `Object`, `String`, or `JSON`
as a bare value, which stays outside the profile until the intrinsics and
built-in objects stream admits standard constructors as values. The
manifest reaches 4,415 cases: 2,610 passes, 1,236 expected negatives, and
569 unsupported profile features with no semantic or harness failures.

M5a Unit 8.5h completes the implicit `arguments` binding's availability and
the unmapped object's own contract. FunctionDeclarationInstantiation creates
the binding for every function form except an arrow, so `admitsArgumentsObject`
now excludes only the `arrow` and `async-arrow` kinds and stops consulting
strictness at all: strict ordinary functions, object and class methods, class
constructors including the implicit and implicit derived ones, synchronous
generators, ordinary asynchronous functions, and asynchronous generators each
receive their own binding through the one path an ordinary non-strict function
already used. Because every eligible enclosing form now declares the name, the
helper that stripped an enclosing implicit binding out of a nested function's
scope chain had nothing left to protect and is removed; an arrow simply
inherits the enclosing scopes, so its `arguments` reference resolves to the
nearest owning form's binding id and its MIR reads that captured cell like any
other closed-over binding. An arrow with no eligible enclosing form leaves the
name unresolved and keeps the ordinary source-located `Unknown binding`
diagnostic, the same one a Script or module top-level reference reports. The
`ResolveState.argumentsObjectUnavailable` flag and the separate
`delete arguments` diagnostic it drove are removed with it: the name either
resolves, and the delete answers `false`, or it does not, and the delete is an
ordinary unresolvable-reference delete answering `true`. Strictness now selects
only the object's shape, so `argumentsMapped` adds `strict !== true` to the
`IsSimpleParameterList` test Unit 8.5g introduced and every strict or
non-simple eligible form takes the unmapped snapshot. Every strict early error
for `arguments` as an assignment target, binding identifier, or declared name
stays in the parser and is unchanged, so the newly created strict binding is
never assignable.

FunctionDeclarationInstantiation's step 18 tests BoundNames of the formals,
not the parameter list a parameter environment lowers them to, so the
frontend records that decision as `argumentsFormal` on `SyntaxFunction` and
HIR gates the implicit binding on it. Without that fact a defaulted or
destructured formal named `arguments` is lowered to a synthetic parameter
name and its own binding is created by a parameter initializer instead, which
left the implicit object created and then shadowed. Step 19's two
suppressions, a body-level function or lexical declaration named `arguments`
when the parameter list has no expressions, are deliberately not implemented:
the declaration that suppresses the object also initializes or shadows the
same binding before any code can read it, so in a closed profile with no
`eval` the extra object is unreachable. A class static block's synthetic
method keeps the object ECMA-262 gives it for the same reason, since its own
`ContainsArguments` early error and the class body's strictness make the name
unusable there.

`oseo_arguments_create` becomes CreateUnmappedArgumentsObject (10.4.4.6)
rather than an approximation of it. Its `callee` parameter is dropped, because
the specified property is not the running function at all: it is a
non-configurable, non-enumerable accessor whose `[[Get]]` and `[[Set]]` are
both `%ThrowTypeError%`, and that holds for every unmapped object, not only a
strict function's. A new `OSEO_THROW_TYPE_ERROR_CODE_ID` internal function,
created on first use and cached on the context beside the other permanently
rooted intrinsics, gives the realm one `%ThrowTypeError%` identity, so both
accessor slots and every unmapped object compare equal and the shared call
dispatcher answers a call on it with a `TypeError`. Only
`oseo_mapped_arguments_create` still defines `callee` as the writable,
configurable data property naming the running function, which is what
10.4.4.7 requires.

Both constructors also define `@@iterator` as a writable, non-enumerable,
configurable data property whose value is the cached
`%Array.prototype.values%` function an array's own `Symbol.iterator` already
resolves to, matching 10.4.4.6 step 6 and 10.4.4.7 step 20. This is not
optional polish for this unit: eighteen reviewed cases already in the
manifest spread `arguments` with `[...arguments]` and were classified
`unsupported-profile-feature` only because the name did not resolve. Once it
does, they compile, so without `@@iterator` they would become semantic
failures. Serving them needs the array iterator to accept a non-array target,
so `oseo_internal_array_values` accepts any object and the iterator's `next`
reads its target's length through a new `LengthOfArrayLike` helper that keeps
an ordinary array's own element count as its fast path, since that is the
value its `length` property reports, and otherwise applies
`ToLength(ToNumber(Get(O, "length")))`: the read observes an inherited or
accessor `length` and propagates its abrupt completion, and the clamp turns a
fractional, string, negative, `NaN`, or infinite value into the specified
integral count. The element read already went through the generic
`oseo_object_get`, and generalizing the receiver made two ordering
requirements observable that an array's own non-configurable `length` had
kept out of reach: `next` now snapshots the iterated target and the cursor
before the length read, so an accessor `length` that reenters the same
iterator cannot steal the index this step yields, and it advances the cursor
before the element `Get`, so an abrupt element accessor leaves the iterator
on the following index instead of retrying the one it failed to read. Both
orderings also correct the pre-existing array path, which a defined accessor
index could already reach. `%ThrowTypeError%` is hardened the way 10.2.4.1
requires:
its `length` and `name` are redefined non-writable and non-configurable and
the function is made non-extensible, so admitted reflection can neither
reshape it nor replace its prototype. The `prototype` object every internal
function in this profile still carries stays a separate boundary the
intrinsics stream owns. The runtime ABI moves from `oseo-runtime-m5-40` to
`oseo-runtime-m5-41`.

Focused HIR tests assert that each of the six owning kinds carries an
`argumentsBindingId` and that neither arrow kind does, that an arrow's
`arguments` expression resolves to its enclosing function's binding id, that a
strict simple parameter list keeps the binding but drops `argumentsMapped`, and
that `delete arguments` answers `false` in an asynchronous function and `true`
in an arrow with no enclosing form; companion MIR tests confirm `buildMir`
threads the strict, asynchronous-generator, and arrow shapes unchanged. Three
fixed native differential fixtures cover the unit's three observable halves.
*unmapped-arguments-forms* exercises a strict ordinary function, sloppy,
strict, and binding-pattern object methods, a class constructor, an instance
method, a static method, a generator method, a derived constructor, an
implicit derived constructor, and strict and binding-pattern generators.
*unmapped-arguments-callee* covers the poisoned accessor's descriptor shape,
its shared identity across two functions, its read, write, redefinition, and
strict and non-strict deletion behavior, the mapped object's contrasting data
property, unmapped index and `length` descriptors, and snapshot independence
in both directions with fresh identity per call. *arguments-lexical-capture*
covers a direct arrow, a nested arrow, a shadowing ordinary function
expression, an arrow in a strict function, an arrow in an object method, an
arrow in a class constructor, an asynchronous function reading `arguments`
across an `await`, an asynchronous function with a default parameter, an
asynchronous generator, and an async arrow capturing its enclosing ordinary
function. Two further fixtures cover what the unit's own review surfaced:
*arguments-declaration-interaction* pins a body-level `var`, `let`, or
function declaration named `arguments` against both the shared and the
separate parameter environment, an explicit `arguments` formal, a
parameter-scope closure that observes the separate body binding, and a class
static block, and *arguments-iteration-and-poison* pins iteration under a
fractional, string, negative, `NaN`, grown, shrinking, infinite, inherited,
and abrupt `length`, the shared `%Array.prototype.values%` identity and its
descriptor, mapped-index iteration after a parameter write, an abrupt
element accessor and the index the following step reads on both an
arguments object and a plain array, a `length` accessor that reenters the
same iterator, a borrowed `%Array.prototype.values%` invoked as a method on
an ordinary array-like with own and inherited indices, and
`%ThrowTypeError%`'s own `length` and `name` descriptors,
non-extensibility, and rejected prototype replacement. A third generated
property with seed `0x60000302` extends the M5 arguments-object model with one
owning form of seven, an optional enclosing strict scope, one to three simple
leading parameters and an optional non-simple trailing formal, zero to five
supplied arguments, a bounded write index, and optional reads through a nested
arrow; its independent oracle predicts the mapped-versus-unmapped selection,
the aliased and snapshot values, the `callee` descriptor shape, and the
poisoned read, and every case also asserts the arrow-boundary diagnostic's
exact message and location and that an explicit `arguments` parameter
suppresses the implicit binding.

The reviewed subset grows by 307 cases and promotes 29 existing entries. The
201 newly reviewed *test/language/arguments-object/* paths contribute 200
passes covering `callee` identity, poisoning, and descriptors, `length`,
indexed writes, deletion, iteration, and one call-site trailing comma in every
admitted function form, plus one expected negative for assignment to
`arguments` in strict code; the complete reviewed group then holds 247 passes
and that one expected negative. A further 51 passes and 55 expected negatives
across *test/language/expressions/* and *test/language/statements/* cover
lexical capture from an arrow, parameter-default references, `for-of` over
both shapes, `var` and function declarations named `arguments`, and the strict
early errors that keep the name off every assignment target. The 29 promoted
entries were classified `unsupported-profile-feature` only because
`arguments` did not resolve: eighteen asynchronous-generator `yield*` cases
that spread `arguments` in a method's logging iterator, two `yield*` receiver
cases, two `AsyncFromSyncIteratorPrototype` cases, two tagged-template
argument-list cases, two class static-initializer cases, and three
for-await-of destructuring cases.
Candidates this unit's own audit leaves out stay out for reasons outside it:
*10.5-1-s.js* and *10.5-7-b-1-s.js* read `eval`, seven cases read `Object` or
`Array` as a bare value, two need `for-in`, two need the `caller` feature, two
tagged-template cases need a realm, four arguments-object cases and 44
`forbidden-ext` and `bind` cases need `Object.prototype.hasOwnProperty` or
`Function.prototype.bind`, and every remaining candidate is `eval` code. The
manifest reaches 4,722 cases: 2,890 passes, 1,292 expected negatives, and 540
unsupported profile features with no semantic or harness failures. Unit
8.5g recorded *unmapped/via-params-dflt.js*, *unmapped/via-params-dstr.js*,
and *unmapped/via-params-rest.js* as blocked on harness value reads; this
unit's audit found the harness compiles cleanly and their only blocker was the
strict variant's missing binding, so all three now pass, as does
*mapped/nonconfigurable-descriptors-define-failure.js*, whose nested arrow
capture that unit recorded as a gap.

M5a Unit 8.5i admits direct `typeof` applied to an unresolvable name.
ECMA-262's typeof evaluation answers `"undefined"` when
IsUnresolvableReference is true instead of throwing the ReferenceError
every other read produces, and the closed profile decides resolvability
ahead of time the same way the Unit 8.1b identifier delete does, so the
frontend folds the whole expression to that string constant: no binding
is read or created, the lowered MIR holds one string constant behind the
existing string-allocation safepoint, and the emitted C never names the
operand. Every other unresolved reference keeps the ordinary
source-located rejection, including a member-access base, a sequence
operand, and an assignment target, so the fold does not weaken the
closed-world rule anywhere else. A parenthesized name forwards the
reference the way the specification's grouping operator does and folds
identically, and Script strictness does not change the answer.

The `with` interaction reuses the ordinary `with-get` reference: every
active object environment is consulted innermost-first, a hit reads the
supplied property through the ordinary property read so an accessor and
its abrupt completion stay observable, and a resolved lexical fallback
keeps the ordinary binding read including its temporal dead zone error.
The one change is the genuinely unresolvable fallback: instead of the
hidden uninitialized cell an ordinary read allocates to preserve its
ReferenceError, the typeof operand's miss fallback is the `undefined`
value itself, so an all-miss chain answers `"undefined"` without an
uninitialized-cell error and without allocating a hidden cell. The one
rejected composition is a folded `typeof`, direct or through `with`, of
a name any `with` region of the same program uses as an unresolved
assignment target that can actually initialize its hidden cell:
ECMA-262 models that sloppy assignment as creating a real global
binding, so the folded answer would misreport the materialized value.
Only an operation that reaches PutValue on an all-miss chain records
the name, which is a non-strict simple assignment or a non-strict
destructuring or loop assignment target. A compound or logical
assignment and an update expression perform GetValue first, throw
ReferenceError on the uninitialized cell before any write, and can
never initialize it, so a caught attempt leaves the name genuinely
unresolvable and keeps the fold admitted, in strict and non-strict code
alike. A strict function or class body nested in a `with` region can
still name a fallback write target, but its all-miss PutValue throws
ReferenceError instead of creating a global; until that strict throw is
lowered, the strict fallback write is itself a source-located
rejection, so it neither runs with the wrong sloppy behavior nor
poisons the fold. The fold keeps the source-located hidden-fallback
rejection the Unit 8.1b delete records, and the check runs after the
whole program resolves, so it holds regardless of where the assignment
and the fold occur relative to each other, including an assignment only
a later loop iteration, a nested closure, or another function performs.
Runtime-owned call-target intrinsic names stay rejected when unshadowed,
whether direct or behind `with`: ECMA-262 resolves `Object`, `Promise`,
`console`, `setTimeout`, and `clearTimeout` to real global values this
profile admits only as call targets, so answering `"undefined"` would
misreport them; the rejection reuses the `isRuntimeOwnedIntrinsicName`
boundary the Unit 8.1b identifier delete records. The same honesty rule
covers every other global name ECMA-262 clause 19 requires of the
ECMAScript 2025 realm ADR 0013 pins, such as `Math`, `JSON`, `Array`,
`Function`, `eval`, and `globalThis`: a conforming realm always
resolves them, so an unshadowed `typeof` of one is a source-located
rejection through the owned `isStandardGlobalName` classification
rather than a misreported `"undefined"`, and the fold answers
`"undefined"` only for a name no conforming realm of the pinned
edition is required to bind. Annex B additions such as `escape` stay
excluded from the claim and remain ordinary unresolvable names. A
shadowing declaration keeps the ordinary binding read, and the admitted
intrinsic values `undefined`, `NaN`, `Infinity`, `Symbol`, and the
error constructors keep their existing resolutions. No MIR, backend, or
runtime change is needed and the runtime ABI stays `oseo-runtime-m5-41`.

Focused tests pin each side: compiler tests assert the fold produces the
string constant with no typeof operation or binding read and that an
unshadowed runtime intrinsic stays rejected, and frontend tests cover
the strict Script, module, parenthesized, shadowed-intrinsic, and both
`with` fallback shapes while keeping every non-typeof unresolved
reference rejected. A fixed *typeof-unresolved* native differential
fixture covers the direct fold, var-declared and initialized bindings,
strict and non-strict functions, an arrow, a caught temporal dead zone
read, a shadowed intrinsic, object-environment hits over a data
property, an undefined-valued property, and an accessor, an all-miss
chain, the lexical fallback through `with`, and a caught dead-zone
fallback, across both specialization policies and forced collection,
and asserts the emitted C never mentions the folded name. A generated
property with seed `0x60002d00` covers direct typeof over unresolvable,
var-declared, number, string, object, and function bindings and a
temporal dead zone in both Script modes, plus `with` chains with
supplied function, number, and undefined values against missing,
lexical, and dead-zone fallbacks, against an independent oracle
alongside Node.js and Deno references, both specialization policies,
and forced collection.

The reviewed test262 subset promotes
*test/language/expressions/typeof/unresolvable-reference.js* from
`unsupported-profile-feature` to a pass in both strictness modes. The
sibling candidates stay outside for reasons this unit does not change:
*get-value-ref-err.js* reads a member of an unresolvable base, which
remains rejected, *get-value.js* and the built-in observers need global
`this` reflection and intrinsics the profile has not admitted, and
*test/built-ins/Promise/constructor.js* keeps its `typeof Promise`
rejection under the new runtime-intrinsic diagnostic. The manifest holds
4,722 cases: 2,891 passes, 1,292 expected negatives, and 539 unsupported
profile features with no semantic or harness failures. The suite
revision, inventory policy, manifest schema, and classification
vocabulary do not change.

M5a Unit 8.5j admits `delete super.property` and
`delete super[expression]`. ECMA-262's delete evaluation evaluates its
operand first and rejects the result only afterward, when
IsSuperReference is true, so the whole SuperProperty reference runs
before the `ReferenceError` it raises. That order is observable in
three places and this unit pins all three. GetThisBinding supplies the
receiver first, so a reference inside a derived constructor before
`super()` reports the uninitialized `this` binding and the key
expression never runs at all. The key expression then runs for its
value and its abrupt completion, so a key that throws reports its own
error rather than the deletion's. ToPropertyKey is never reached, so a
key object is never asked for a string. Nothing is ever deleted:
GetSuperBase reads the home object's `[[Prototype]]` through an
internal method that runs no user code, no lookup starts at it, and the
parent property and the receiver are unchanged whether or not the named
property exists.

Owned syntax admits the existing `super-base` operand in the delete
member position, which is the smallest representation that carries the
receiver read the specified order needs. HIR resolves that operand to
the enclosing element's `this` exactly as a `super` read does, so the
derived constructor's temporal dead zone is the binding read the
profile already lowers rather than a second mechanism. MIR lowers the
receiver, then the key expression, and then one `super-property-delete`
operation that takes no argument and never completes normally. It emits
no `super-base`, no `delete-object-coercible`, and no `property-key`
operation, which is what makes the absent lookup and the unconverted
key structural rather than incidental. Specialization has no effect:
the rejection has no guard, no cache, and no generic fallback to
choose between, so both policies lower and emit the same operation.

This unit advances the runtime ABI to `oseo-runtime-m5-42`. It adds
`oseo_super_property_delete`, which raises the ReferenceError and
reports no normal completion, the same shape
`oseo_write_immutable_binding` already uses for an operation whose only
outcome is its own error.

Every existing `super` boundary is unchanged. A class body without
`extends` and an object literal method keep the source-located
rejection the `super` property unit records, because this runtime still
has no `Object.prototype` object for such a home object to reach, so
admitting the delete operand does not widen where `super` may be
written. A destructuring assignment target and a `for` head keep their
own rejections, deleting a private member stays an early error, and
`super?.x` and `super.#x` stay parse errors the bootstrap parser
reports. An optional chain whose base is a `super` property keeps
deleting its final ordinary reference, since that reference is not a
`super` reference.

Both reference hosts deviate from the specified order here. V8 and
JavaScriptCore evaluate the key expression before reading the receiver
in a derived constructor, so they run a key expression ECMA-262 never
reaches and report the deletion's own error instead of the
uninitialized-`this` error; test262 rejects that order. The evidence is
therefore split: the frontend structural tests and the reviewed test262
subset pin the specified order, while the fixed native differential
fixture and the generated property suite keep the derived-constructor
case to keys with no observable evaluation so their Node.js and Deno
comparisons stay exact.

Frontend tests assert that the operand is admitted in each element form
carrying a home object, covering an instance, static, symbol-keyed, and
private method, a constructor, an arrow, an asynchronous method, a
generator, an asynchronous generator, a getter, a setter, a static
getter, an instance and a static field, a static block, a computed key,
and a parenthesized operand, and that each lowers to the rejection with
no `super-base`, `property-delete`, or `delete-object-coercible`
operation. A separate structural test asserts the receiver read,
the key call, and the rejection in that order under both specialization
policies with no key conversion before it. A fixed *class-super-delete*
native differential fixture covers the dot and computed forms, a
parenthesized operand, an arrow, a getter, a static method reaching the
constructor chain, a derived constructor before and after `super()`, a
field initializer, a static block, a generator, an asynchronous method,
a side-effecting key, an abrupt key, a poisoned key object that is
never converted, a present and an absent parent property, the surviving
parent property and prototype value, an optional chain through a
`super` property that still deletes its final ordinary reference, and
an awaited and a yielded key whose traced suspension the evaluated
receiver survives, across both specialization policies and forced
collection. A generated
property with seed `0x60000e00` draws one of ten element forms against
static, pure computed, side-effecting, abrupt, and poisoned keys naming
a present or absent property, and checks the key-evaluation log, the
reported error, and the surviving parent property against an
independent oracle alongside Node.js and Deno references, both
specialization policies, and forced collection.

The reviewed test262 subset newly reviews the five directly applicable
*test/language/expressions/delete/* super cases.
*super-property-method.js* and *super-property-uninitialized-this.js*
pass, the second because the receiver is read before the key
expression. Three record boundaries this unit does not change:
*super-property.js* needs `Object` as a heritage value,
*super-property-null-base.js* needs `super` in a class body without
`extends`, and *super-property-topropertykey.js* needs `super` in an
object literal method. The manifest reaches 4,727 cases: 2,893 passes,
1,292 expected negatives, and 542 unsupported profile features with no
semantic or harness failures. The suite revision, inventory policy,
manifest schema, and classification vocabulary do not change, and the
41,091-path applicable-test inventory is unchanged.

M5a Unit 8.5k admits `super.property` and `super[expression]` as an
assignment target in a destructuring assignment pattern and in the
for-of and for-await-of heads the profile already admits. Both positions
share one shape ECMA-262 gives them: the target reference is evaluated
and then held until PutValue stores through it. That is exactly the
receiver-carrying pair an ordinary `super` assignment already lowers, so
the unit admits the existing `super-base` operand in the two target
positions rather than adding a target representation of its own.

The specified order is observable in five places and this unit pins all
five. An `AssignmentElement` evaluates its DestructuringAssignmentTarget
before the iterator step that supplies the value, and an
`AssignmentProperty` evaluates its property name first, then the target,
then the value; ForIn/OfBodyEvaluation evaluates a head target once per
iteration, after the step that produced the value. Inside the reference,
GetThisBinding supplies the receiver first, so a target before `super()`
in a derived constructor reports the uninitialized `this` binding and
its key expression never runs at all, and MakeSuperPropertyReference
reads the home object's `[[Prototype]]` only after that key expression.
ToPropertyKey belongs to PutValue, so a key object is asked for a string
only after the stored value exists. PutValue hands the super base to
ToObject itself, so a null home object prototype reports the `TypeError`
the store raises rather than a separate RequireObjectCoercible on a base
no expression produced. An abrupt reference is an abrupt destructuring
or loop step, so ArrayAssignmentPattern closes an unfinished iterator
and ForIn/OfBodyEvaluation closes the loop's iterator, through
AsyncIteratorClose under `for await`.

The store keeps `Set` with a distinct receiver, unchanged from the
ordinary `super` assignment: a setter found on the base chain runs
against the enclosing element's `this`, and a target that reaches no
setter defines an own writable, enumerable, configurable property of
that receiver while the parent object is unchanged. A read-only parent
property reports a `TypeError`, because a class body is strict.

Owned syntax needs no new node: the `assignment-member` leaf and the
`property` for-of head target already carry a `SyntaxExpression` object,
and the frontend now admits the `super-base` operand there. HIR resolves
that operand to the enclosing element's `this` exactly as a `super` read
does, so the derived constructor's temporal dead zone is the binding
read the profile already lowers. MIR extends the prepared assignment
reference it already holds across the value's evaluation with that
receiver, then emits one ordinary `property-set` marked as a `super`
reference. No new MIR operation, no new runtime entry point, and no ABI
change follow, and specialization has no effect: neither store has a
guard, a cache, or a generic fallback to choose between, so both
policies lower and emit the same operation. The prepared reference is
the shape M5a Unit 8.5l reuses for a for-in head, which this unit does
not admit.

Every existing `super` boundary is unchanged. A class body without
`extends` and an object literal method keep the source-located rejection
the `super` property unit records, because this runtime still has no
`Object.prototype` object for such a home object to reach. A private
member in a target position stays an early error, and `super?.x` and a
declaration pattern such as `for (const [super.x] of it)` stay parse
errors the bootstrap parser reports. Both reference hosts agree with
ECMA-262 on every order this unit pins, including the receiver read that
precedes a key expression before `super()`, so the fixed native
differential fixture and the generated property compare against Node.js
and Deno without an excluded case.

Frontend tests assert that the target is admitted in each pattern
position the grammar reaches, covering an array element, an object
property, a computed object key, a nested array and object pattern, an
element and a property default, an array rest element, an object rest
property, and a parenthesized target, in an instance, static, and
symbol-keyed method, a private method, a constructor, an arrow, an
asynchronous method, a generator, an asynchronous generator, a getter, a
setter, a static getter, an instance and a static field, and a static
block, and that each lowers to the ordinary `super` property set with
its receiver argument and no RequireObjectCoercible. Separate structural
tests assert the receiver read, the key expression, the home object
prototype read, the iterator step, the key conversion, and the store in
that order for an array pattern leaf, the property name before the
target reference and `GetV` after it for an object pattern property, and
the iterator step before the receiver read for a head, under both
specialization policies. A fixed
*class-super-targets* native differential fixture covers every target
position, dot, computed, symbol, and parenthesized references, an arrow,
a getter, a setter, a static method, a static block, a field
initializer, a generator, an asynchronous method, an asynchronous
generator, a derived constructor before `super()`, a parent setter, an
own property the store defines and its attributes, a read-only parent
property, and a null home object prototype. Over a tagged source getter
and tracked synchronous and
asynchronous iterables it also pins the property name, the target
reference, and the `GetV` that follows it, the target reference that
runs before the iterator step, the key conversion that runs after it,
and
every `IteratorClose` and `AsyncIteratorClose` the specified order
performs, from an abrupt direct head, an abrupt head pattern whose own
iterator closes before the loop's, an abrupt leaf, and a target before
`super()`, together with an awaited and a yielded value whose traced
suspension the evaluated reference survives, across both specialization
policies and forced collection. A generated property with
seed `0x60002a00` draws one of ten element forms and one of ten target
positions against static, pure computed, side-effecting, abrupt, and
poisoned keys naming a parent setter, a parent data property, or an
absent property, and checks the key-evaluation log, the stored value,
and the receiver and parent property state against an independent oracle
alongside Node.js and Deno references, both specialization policies, and
forced collection. The generated log deliberately observes what a single
printed line can carry; the evaluation order and the iterator-close
routing it cannot observe are pinned by the frontend structural tests
and the fixed fixture.

The applicable-test inventory holds no case that writes a `super`
property from a destructuring pattern or a loop head; the only source
that does is *test/staging/sm/class/superPropDestructuring.js*, which
sits outside the reviewed candidate roots. The subset therefore newly
reviews the six applicable cases that pin the two families this unit
joins. *target-super-computed-reference.js* passes and is the case that
pins the deferred ToPropertyKey a `super` target shares with every
position this unit adds. *head-lhs-member.js*, *body-dstr-assign.js*,
and *body-dstr-assign-error.js* pass and pin the for-of head target, its
destructuring form, and the IteratorClose an abrupt target performs.
*target-super-computed-reference-null.js* and
*target-super-identifier-reference-null.js* record a boundary this unit
does not change: both write `super` inside a class body without
`extends`. The two *body-dstr-assign* cases declare the
`destructuring-assignment` feature, which the reviewed feature list now
records as supported; no other reviewed case declares it, so no existing
classification moves. The manifest reaches 4,733
cases: 2,897 passes, 1,292 expected negatives, and 544 unsupported
profile features with no semantic or harness failures. The suite
revision, inventory policy, manifest schema, and classification
vocabulary do not change, and the 41,091-path applicable-test inventory
is unchanged.

M5a Unit 8.5l admits the `for-in` statement with its base enumeration
semantics and simple heads. ECMA-262 gives the enumerate head a shape the
iterate head does not have, and this unit follows it rather than reusing
the for-of lowering. ForIn/OfHeadEvaluation returns a break completion
when the subject is `undefined` or `null`, so the whole statement is
skipped without an error and without a ToObject conversion; every other
value converts, and EnumerateObjectProperties supplies an iterator that
is never closed. ForIn/OfBodyEvaluation therefore performs no
IteratorClose for an enumerate head: an abrupt head reference, an abrupt
PutValue, and a `break`, `continue`, `return`, or `throw` in the body all
leave the loop through the enclosing transfer alone.

The enumeration itself is unspecified in mechanics and order and
specified in rules, so a conforming implementation must choose when it
obtains each level's own keys, and the choice is observable. This unit
makes the choice both reference hosts make: the whole prototype chain is
collected once, when the enumeration is acquired. Collection walks the
chain outward and takes each level's own string keys in
OrdinaryOwnPropertyKeys order, ascending array indices first and then the
remaining string keys in creation order. Symbol keys are dropped. A name
already recorded at a nearer level is skipped whether or not that nearer
property was enumerable, which is the specified shadow rule, so a
non-enumerable own property suppresses the same name on every prototype
behind it and no name is ever collected twice. A surviving name is
collected only if its own property was enumerable when its level was
read. Each step then reports the next collected name while the receiver
still has a property of that name anywhere on its chain, which is what
makes a property deleted before it is processed ignored, as the rules
require. A property added during the enumeration, a prototype replaced
during it, and a collected property made non-enumerable during it are all
invisible to it, and both reference hosts agree on each of those
observations. No step runs user code: this realm has no proxy and no
exotic object whose own-key, descriptor, or prototype access is
observable, so the enumeration cannot be reentered and reports no abrupt
completion of its own.

The alternative reading, the informative generator ECMA-262 prints beside
the rules, obtains a prototype's own keys only when the walk reaches it.
Both readings satisfy every stated rule, and an earlier revision of this
unit implemented the lazy one; the generated property suite found the
divergence within three cases, on a non-enumerable prototype shadow
deleted before its level would have been entered, where Node.js and Deno
agree with the eager reading. The eager reading is therefore what this
profile records, and the fixed fixture pins all five observations that
distinguish the two.

ToObject is modeled rather than materialized, because this profile has no
primitive wrapper objects yet. A string subject reports one enumerable
own index property per code unit and a non-enumerable `length`, which is
exactly what a String exotic object owns, and %String.prototype% is not an
object this realm creates. Every other primitive wrapper owns no property
at all, so enumerating one is enumerating its prototype: `Symbol` is the
only such intrinsic this profile admits as a value, so a symbol subject
enumerates %Symbol.prototype% directly and a number, boolean, or BigInt
subject reports nothing. An Array's `length` and a function's `prototype`
are own non-enumerable properties this runtime keeps outside its property
vector; both enter collection as shadows so that a prototype of the same
name stays suppressed.

Owned syntax adds a `for-in` statement carrying a subject and a target
rather than extending the for-of node, because the skipped nullish
subject and the absent close are the statement's shape rather than a
flag. The target reuses the resolved for-of target, minus the two pattern
kinds, which are excluded structurally: an object pattern head belongs to
M5a Unit 8.5m, no other pattern form is admitted before it, and an array
pattern head or a `for (const { a } in o)` head is a source-located
rejection instead of a representable target with no lowering. The simple
heads this unit admits are a `var`, `let`, or `const` identifier
declaration and an assignment target the profile can already represent: an
identifier, including one resolved through `with`, an ordinary or
computed property, a private member, and a `super` property. A head
initializer, which is Annex B's legacy VarDeclaration form, stays
rejected, as does a multi-declarator head.

HIR creates the head's lexical environment before resolving the subject,
so `for (let k in { [k]: 1 })` reports the temporal dead zone rather than
an outer binding, and resolves an assignment or `var` target in the
surrounding scopes, which is where ForIn/OfBodyEvaluation evaluates it
once per iteration. A non-strict identifier target behind `with` records
its name as an initializing fallback write exactly as the for-of head
does, so the Unit 8.5i `typeof` fold stays rejected for that name, and a
strict fallback write keeps that unit's source-located rejection. MIR
lowers the subject, one `enumerate-get`, and a branch that skips the whole
statement when the subject was nullish, then a step block holding one
`enumerate-next` and its branch. It pushes no finalizer and no abrupt
target, which is what makes the absent close structural. Both
specialization policies lower and emit the same two operations: neither
has a guard, a cache, or a generic fallback to choose between. The
per-iteration store reuses ForIn/OfBodyEvaluation's shared target
lowering, so a `super` head keeps its receiver argument and its deferred
ToPropertyKey, and a lexical head still receives a fresh cell each
iteration.

A step's reachability check is HasProperty, so it must agree with what a
read of the same name would find. This runtime serves several intrinsic
methods, including an array's `push` and `Symbol.iterator`, a promise's
`then`, `catch`, and `finally`, and `%GeneratorPrototype%`'s resumption
methods, from a virtualized table rather than from a materialized
prototype object, and the `in` operator carried a second, drifted copy of
that table: it was missing an array's `push` and a generator prototype's
`throw`, so `"push" in []` answered `false` where a read answers a
function. The table now lives once, beside the read it mirrors, and both
HasProperty and the enumeration step consult it, which fixes the `in`
operator's two missing names as well. The unit's own generated property
found the enumeration half of this defect; the `in` half is a
pre-existing divergence the shared helper removes.

This unit advances the runtime ABI to `oseo-runtime-m5-43`. It adds
`oseo_enumerate_get`, which reports exhaustion instead of an iterator for
a nullish subject, and `oseo_enumerate_next`, which reports the next key
or exhaustion. Both keep the `value` and `done` contract the iterator
step already uses, so the backend branches on a scalar while the record
and the key stay in root slots that survive forced collection and a
suspension taken in the body. The enumeration record is a new traced heap
kind holding the collected key list and the receiver each step consults;
it is never reachable from ECMAScript code, so it has no prototype, no
`next` property, and no close.

Focused frontend tests assert that every admitted head converts to owned
syntax, that a private and two `super` head targets lower to the private
write and the ordinary `super` property set with its receiver argument,
that the lowered program holds exactly one acquisition and one step and
no iterator operation at all, that a lexical head resets its cell once
before the subject and once per iteration while a `var` head resets none,
that a `super` head's receiver read, key expression, GetSuperBase,
ToPropertyKey, and store all follow the step, that a label binds to the
statement's own transfers, and that every head this unit does not admit
keeps its source-located rejection, including the `typeof` fold a
non-strict `with` fallback target poisons. Two fixed native differential
fixtures cover the unit's two halves. *for-in* covers the five head forms,
a computed and an ordinary member target, a `super` and a private target,
nullish and non-object subjects, a string subject, a sparse array with an
extra string key, per-iteration closure identity, labeled `break` and
`continue`, a `return` through `finally`, a `throw`, the head temporal
dead zone, and an empty subject. *for-in-enumeration* covers canonical
order, symbol exclusion, a three-level prototype chain, a non-enumerable
shadow, a non-enumerable own property, the five observations that
distinguish eager from lazy collection, an own key whose deletion
uncovers an inherited virtualized intrinsic, deletion during enumeration
including a deleted own key that suppresses its prototype twin, addition
during enumeration, accessor keys, a function, a class and its heritage,
an instance, a bare and an extended `Symbol.prototype`, a well-known
symbol, a number, a boolean, and a BigInt subject, two independent
records over one object, and a suspension inside a generator and an
asynchronous function body. Both run under both
specialization policies with forced collection, and both assert that the
emitted C acquires and steps the enumeration and never closes an
iterator. A generated property with seed `0x60001500` draws a one- to
three-level prototype chain of enumerable and non-enumerable index and
string keys against object, string, number, symbol, `null`, and
`undefined` subjects, through all five head forms, with a key added to or
deleted from the own or the parent level after the first reported key, and
checks the reported sequence against an independent transcription of the
specified rules alongside Node.js and Deno references, both specialization
policies, and forced collection.

The reviewed subset grows by 124 cases and promotes two existing entries.
The 124 newly reviewed paths contribute 33 passes, 63 expected negatives,
and 28 unsupported profile features. The passes cover the enumeration
order rules, the `let`, `const`, and `var` block-scope heads, the
`head-lhs-member`, `head-decl-expr`, and `head-expr-expr` head forms, the
lexical head's fresh binding per iteration, its temporal dead zone, and
the top-level-await subject positions; the reviewed feature list now
records `for-in-order` as supported, which is what lets the three
`order-*` cases execute. The expected negatives keep every head early
error: a duplicate or `let`-named lexical head name, a lexical head bound
name reused in the body, a labelled function statement body, a
non-assignment-target and a covered non-assignment-target head, an
invalid assignment pattern head, a declaration in the head that is not a
binding, and the strict `arguments` and `eval` head targets. The 28
unsupported entries record prerequisites this unit does not change:
eight completion-value cases and six scope cases need `eval`, six
`S12.6.4_*` cases need `eval` or an undeclared global, four cases need
`let` as an identifier, one needs an array pattern head, which stays
outside the object pattern head M5a Unit 8.5m admits,
one needs `Object.create` descriptor maps, one needs a resizable
ArrayBuffer, and one needs a regular expression literal. Seven further
`test/language/statements/for-in/` cases stay outside the subset because
they reach `Object.prototype.hasOwnProperty` or `String.prototype.indexOf`
at run time rather than at compile time, so their only blocker is a
built-in family, not the statement. The two promoted entries were
classified `unsupported-profile-feature` only because the statement did
not compile: *optional-chaining/iteration-statement-for-in.js* and
*class/elements/privatefieldset-typeerror-7.js*, which writes a private
member from a for-in head. The manifest reaches 4,857 cases: 2,932
passes, 1,355 expected negatives, and 570 unsupported profile features
with no semantic or harness failures. The reviewed dependency vocabulary
gains `property-enumeration`, which names the EnumerateObjectProperties
dependency the new cases share. The suite revision, inventory policy,
manifest schema, and classification vocabulary are otherwise unchanged,
and the 41,091-path applicable-test inventory is unchanged.

M5a Unit 8.5m admits the object pattern `for-in` head. It changes nothing
about the enumeration M5a Unit 8.5l established: the acquisition, the
step, the skipped nullish subject, and the absent close are the same two
owned operations, and the unit adds one representable head target rather
than a second enumeration. ForIn/OfBodyEvaluation already gives an
enumerate head the same per-iteration store an iterate head has, so an
`ObjectBindingPattern` declaration head and an `ObjectAssignmentPattern`
assignment head reuse the recursive destructuring the profile owns for
standalone declarations, for-of heads, and destructuring assignments.

The order the unit pins follows from where the pattern sits. A `let` or
`const` head creates its own lexical environment before the subject
expression runs, so every bound name of the pattern is in its temporal
dead zone while the subject is evaluated, and ForIn/OfBodyEvaluation
creates a fresh environment holding all of them again on each iteration,
which is what makes a closure created in one iteration observe that
iteration's cells. A `var` head and an assignment head resolve in the
surrounding environment instead and write the same cells every iteration.
The step produces the value first, so the whole pattern runs after it:
RequireObjectCoercible applies to the enumerated String key, never to the
subject; each AssignmentProperty or BindingProperty then evaluates its
property name, then its target reference where it has one, then `GetV`,
then a default only when `GetV` answered `undefined`, then the store. A
final rest property snapshots the key's own enumerable string keys and
excludes every property name evaluated before it. An abrupt completion
anywhere in the pattern, including a poisoned computed name, a `GetV`
that throws, a nullish nested pattern input, and a failed store, leaves
the loop through the enclosing transfer, because an enumerate head has no
iterator to close; the enumeration record is simply dropped. A label
binds to the statement's own transfers unchanged, an identifier leaf
resolved through `with` reaches PutValue on the object environment
exactly as a direct head target does, and a strict fallback write keeps
the M5a Unit 8.5i rejection while a non-strict one records its name so
that unit's `typeof` fold stays rejected for it. A pattern subexpression
may `await` wherever the M5a Unit 8.3 positions may, which is a body that
owns a traced suspension frame; a module top level keeps that unit's
rejection, now located at the for-in statement that carries the head.

Because ToObject of the key is modeled rather than materialized, the
values a head pattern can read are exactly a String exotic object's: one
enumerable own index property per code unit and a non-enumerable
`length`. That is enough for the whole object pattern family. It is not
enough for an array pattern, and that is why this unit keeps every array
pattern position rejected rather than admitting the head form the shared
lowering would otherwise accept. This realm creates no string iterator,
so an array pattern reached from a for-in head could only report a
`TypeError` where ECMA-262 destructures the key's code units; a
source-located rejection is the honest answer until the string iterator
exists. The rejection covers the head's own array pattern form, which a
later unit owns anyway, and an array pattern nested below an admitted
object head, which the same evidence excludes. Owned syntax can still
represent the nested form, because it is the object pattern's ordinary
recursive leaf, so HIR construction repeats the rejection for every
frontend instead of leaving it to the bootstrap frontend alone. A
reserved word used as a binding name anywhere in the head stays the
early error it already is, reported before either boundary. The other retained
boundaries are unchanged and unrelated to patterns: Annex B's head
initializer, a multi-declarator head, and a head target the profile
cannot represent all keep their existing source-located diagnostics, and
the reserved-word, duplicate-name, and invalid-target early errors stay
where the bootstrap parser and the profile's early-error checks already
report them.

Owned syntax narrows the two for-of pattern target kinds to an object
pattern instead of adding a head of its own, so an array pattern head is
unrepresentable rather than representable with no lowering, and every
leaf below the head keeps the recursive shape the pattern already has.
HIR resolves a lexical pattern head's names into the head environment
before the subject and an assignment or `var` head's leaves in the
surrounding scopes, rejecting a duplicate lexical name in the head
because owned syntax does not assume a particular frontend reported it.
MIR resets each lexical leaf once before the subject and once per
iteration, then reuses `lowerForHeadTarget`, which already routes both
pattern kinds into the shared binding-pattern lowering; no MIR operation,
no runtime entry point, and no ABI change follow, so the runtime ABI
stays `oseo-runtime-m5-43`. Specialization has no effect: the head has no
guard, no cache, and no generic fallback to choose between, so both
policies lower and emit the same operations.

Frontend tests assert that a `const`, `let`, `var`, and assignment object
pattern head all convert to owned syntax, including a computed name, a
default, a rest property, a nested object pattern, and ordinary member,
private, and `super` leaves, and that the lowered program holds exactly
one acquisition, one step, and no iterator operation at all under both
specialization policies. Separate structural tests assert that the
enumeration step precedes RequireObjectCoercible of the key, that a
property name precedes its target reference and that `GetV` follows it,
that a `super` leaf reads its receiver before GetSuperBase and converts
its own key only after the value exists, that each lexical leaf resets
twice while a `var` head resets none, that the head's temporal dead zone
reaches the subject, and that every array pattern position and every
`with` fallback boundary keeps its source-located rejection, and that a
reserved-word binding name in the head reports its early error first.
Compiler-core tests build a nested array pattern head directly in owned
syntax, bypassing the frontend, and pin the HIR rejection for the
lexical, `var`, and assignment forms. A module
test pins that an `await` inside the head pattern keeps the M5a Unit 8.3
module top-level rejection at the statement that carries it. A fixed
*for-in-object-patterns* native differential fixture covers the four head
forms, computed names and their evaluation order, defaults applied only
to `undefined`, a rest property and the keys it excludes, a nested object
pattern, member, computed member, private, and `super` leaves, nullish
and non-object subjects, a string subject, an abrupt nested pattern, an
abrupt computed name, per-iteration closure identity, labeled `break` and
`continue`, a `return` through `finally`, a `with`-resolved leaf, the
head temporal dead zone, a read-only strict target, and a suspension
inside a generator and an asynchronous function body, under both
specialization policies with forced collection, and asserts that the
emitted C acquires and steps the enumeration and never closes an
iterator. Node.js strips types from a *.ts* reference file and its
TypeScript parser rejects a destructuring for-in head that ECMA-262
admits, so the fixture hands both reference hosts the same source as a
global Script. A generated property with seed `0x60001400` draws one to
three properties with static and computed present, absent, and index
names, optional defaults, identifier, member, and nested pattern leaves,
and an optional rest property, through all four head forms and over
object, empty object, string, number, `null`, and `undefined` subjects,
and checks the evaluated-name log, every stored value, the rest object,
and the abrupt completion against an independent transcription of
ForIn/OfBodyEvaluation's destructuring alongside Node.js and Deno
references, both specialization policies, and forced collection.

The applicable-test inventory holds no case that destructures a for-in
key with an object pattern and executes. Every applicable case is an
early error: the fourteen `test/language/statements/for-in/dstr/obj-*`
cases and *head-lhs-invalid-asnmt-ptrn-obj.js* are already reviewed as
expected negatives, and they stay negatives, which is what proves this
unit admits the head without weakening the early errors around it. Seven
reviewed cases record the array pattern head boundary instead of a
pattern head boundary in general; their classification does not move, and
only the rejection text the manifest quotes changes.
*head-let-destructuring.js*, *head-var-bound-names-dup.js*, and the five
`scope-*` cases all use a `let [` or `var [` head, so they stay
`unsupported-profile-feature` at the array pattern head boundary. The
manifest therefore
holds 4,857 cases: 2,932 passes, 1,355 expected negatives, and 570
unsupported profile features with no semantic or harness failures. The
suite revision, inventory policy, manifest schema, reviewed feature list,
dependency vocabulary, and classification vocabulary are unchanged, and
the 41,091-path applicable-test inventory is unchanged.

M5a Unit 8.5n is the authoritative stale-profile-claims and gap audit.
It compares the admitted prose with the frontend and compiler diagnostics,
the implemented lowering and runtime paths, the applicable-test inventory,
and the reviewed results. Claims that `??`, logical assignment, BigInt
update, private static elements, private brand checks, private assignment
targets, asynchronous generators, `export default class`, or traced module
await positions remain rejected were stale and are corrected in the profile.

The audit also found one M5a evidence gap. Optional private field and accessor
reads such as `object?.#field` and `object?.#accessor`, and optional private
method calls such as `object?.#method()`, reached parser-owned syntax, HIR, and
MIR, but had no native or differential execution covering nullish short
circuit, valid-brand access, invalid-brand `TypeError`, and method receiver
preservation under both specialization policies and forced collection. Unit
8.5o closes that gap.

The executable rejections that remain have owners outside the two M5a
streams. An array pattern reached from a `for-in` key needs the M5b string
iterator. A `super` property reference in an extends-free class or object
literal method needs the M5b `Object.prototype`. A statically unresolved
ordinary read or strict unresolved write needs the M5b global binding model
to distinguish absent names from the realm's standard and mutable global
properties; this includes the reviewed block- and switch-scope cases that
expect a runtime `ReferenceError`. `import.meta`, `export var`, namespace
re-exports such as `export * as ns from "./module.js"`, and module top-level
pattern-position `await` remain with the modules and asynchronous execution
stream. TypeScript-only syntax is outside the ECMA-262 claim, and dynamic
source remains owned by ADR 0016.

At Unit 8.5n, the audit therefore kept the M5a checkpoint open for the
separate optional private read and call evidence unit without changing the
reviewed manifest's 4,857 cases, 2,932 passes, 1,355 expected negatives, 570
unsupported profile features, zero semantic failures, or zero harness
failures. The 41,091-path inventory, suite and edition revision pins, property
seeds and budgets, and compatibility overrides were unchanged.

M5a Unit 8.5o admits optional private field and accessor reads and optional
private method calls through execution evidence. The optional guard runs
before the private read, so `null` and `undefined` produce `undefined` without
a brand check, getter call, method lookup, or argument evaluation. A live
receiver reaches the existing private get, which performs the brand check and
invokes an accessor getter where applicable. An optional private method call
retains the live receiver as `this`. No parser, HIR, MIR, runtime, or ABI
contract changes; the runtime ABI remains `oseo-runtime-m5-43`.

The fixed *class-optional-private-reads* and
*class-optional-private-methods* native differential fixtures cover valid-brand
field and accessor reads, invalid-brand `TypeError`, method receiver
preservation, nullish short circuit and argument suppression, truthful and
false numeric hints, both specialization policies, and forced collection. The
method fixture's enabled policy also proves both specialization guard hits and
misses. The generated property uses seed `0x60002500` for twelve ordinary
cases over field, accessor, and method operations; valid, invalid, `null`, and
`undefined` receivers; bounded private values; and number or string method
arguments. Its independent oracle predicts the result or `TypeError` and the
exact receiver, getter, method, and argument evaluation log before comparison
with Node.js, Deno, and native execution under both specialization policies.

Four applicable test262 cases are reviewed at revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`. The expression and statement
forms of *grammar-private-field-optional-chaining.js* pass. The corresponding
*private-field-after-optional-chain.js* cases remain
`unsupported-profile-feature` because they construct the receiver with
`new Object()`, an M5b intrinsic boundary. No prior result moves. The manifest
therefore reaches 4,861 cases: 2,934 passes, 1,355 expected negatives, and 572
unsupported profile features, with no semantic or harness failures. The
41,091-path inventory, suite revision, manifest schema and vocabulary, and
zero-override policy are unchanged. The property inventory increases by one
domain, one seed, and twelve ordinary cases. This evidence closes M5a; the
remaining gaps keep their M5b, module and asynchronous execution, standards
harness, host, or accepted dynamic-source owners.

### Intrinsics and built-in objects

Establish the intrinsic graph, well-known symbols, iterator protocols, error
objects, and property attributes needed by standard constructors and prototype
methods. Add numeric, string, array, object, function, collection, regular
expression, date, and binary-data families in dependency order.

[*PLAN-BIGINT.md*](./PLAN-BIGINT.md) owns the `BigInt` intrinsic, prototype,
wrappers, fixed-width conversion functions, and the primitive contracts later
binary-data and atomic families consume. M5a Unit 8.1a selects the all-heap
30-bit-limb primitive representation. The intrinsic, prototype, wrappers, and
fixed-width conversions remain an M5b boundary.

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

Static *.wasm* imports are host module integration, not an ECMAScript grammar
or M5 compatibility unit. [*PLAN-WASM.md*](./PLAN-WASM.md) may reuse the closed
module graph after its own feature, linking, target, and evidence decisions
land. That checkpoint does not change the M5 test262 denominator or claim
boundary.


M5b work graph
--------------

The M5b queue is checked in as a machine-readable graph rather than a
hand-drawn phase scheme, so an implementation session can take any work item
whose dependencies are already merged instead of asking which phase it is in.
[*docs/m5b-graph/graph.yaml*](./docs/m5b-graph/graph.yaml) holds the node
counts, the advisory collision list, the repository-wide serialization points,
and the ordered fallback backlog. One record per node lives under
*docs/m5b-graph/nodes/*, naming what the node delivers, the included inventory
paths it claims, its dependencies by ID, and whether it is ready, blocked, or
parked.

`mise run check:m5b-graph` rejects an unknown ID, a dependency cycle, an
unparked node depending on a parked one, a status that disagrees with the
landed state of its dependencies, a recorded path count that does not match
*tests/test262/inventory.tsv*, a selector naming a root the graph does not
cover, two nodes claiming the same upstream path, and any included path under
*test/built-ins/* that no node claims. That last rule is what keeps the graph
a partition of the built-in denominator rather than a selection from it. A
parked node may depend on another parked node, because neither is work the
graph hands out. A session takes a node whose status is `ready` and whose
`landed` field is still `false`; the change that lands it sets that field and
updates the dependents whose status the landing changes.

Read the graph directly rather than a prose copy of it. The decisions it
encodes are recorded here with their reasons.

 -  The primitive families at the root of M5b are implemented in the C
    runtime. Nothing else about M5b is decided here. The root families have no
    alternative: the realm has no `%Object.prototype%`, no global object, and
    no `String` or `Array` prototype methods, so the compiled profile cannot
    yet express what they need. Later families land after those prerequisites
    exist, so the choice reopens for each of them.
    [*ROADMAP.md*](./ROADMAP.md) asks every family to weigh a self-hosted
    implementation against a C one and to record the choice and its evidence
    when the family lands. That weighing belongs to each family's own change,
    not to this plan.
 -  `object-prototype` precedes the `Object` statics.
    `oseo_object_literal_create` passes `oseo_null()` as the prototype, so an
    object literal has a null `[[Prototype]]`, and the methods a lookup on it
    would find are virtualized behind the per-object `default_intrinsics` flag
    and fabricated by name comparison in *runtime\_property.c*. Materializing
    `%Object.prototype%` first means the statics are written against real
    property lookup instead of extending the mechanism they replace.
 -  `builtin-code-registry` is a root beside `intrinsic-graph-root` rather than
    a dependent of it. Built-in function code IDs are one dense hand-numbered
    block in *runtime\_internal.h* and dispatch is one else-if chain in
    *runtime\_function.c*, so every family that adds a built-in function edits
    both. Neither refactor needs the other, so the graph records no edge
    between them. It records no edge to the later families either, because a
    dependency would claim they need the registry to be correct when what they
    need is not to be rewriting the same chain at the same time. Nothing in
    the schema expresses that, so it is an operational rule instead: land
    `builtin-code-registry` early, and before running built-in-function nodes
    concurrently.
 -  `weak-collections` and `date-family` are parked, not blocked. Weak
    collections need the ephemeron tracing and finalization that
    [*PLAN-GC.md*](./PLAN-GC.md) leaves out; that plan assigns their language
    semantics to M5, and no M5 document owns the collector contract behind
    them. `Date` depends on the clock and wakeup integration checkpoint in
    [*PLAN-NIO.md*](./PLAN-NIO.md), whose probe work has not started and whose
    real-time and monotonic-domain choices need maintainer judgment. Neither
    becomes ready by landing anything else in this graph.
 -  Annex B block-level function hoisting and indirect `eval` var bindings are
    not prerequisites of `global-object-record`.
    [*docs/language-profile-m5.md*](./docs/language-profile-m5.md) already
    records why: the first is outside the candidate claim under
    [ADR 0013](./docs/adr/0013-m5-edition-and-manifest.md), and the second is
    an authorized exclusion under
    [ADR 0016](./docs/adr/0016-dynamic-source-boundary.md) and
    [ADR 0019](./docs/adr/0019-m5-claim-closure.md).
 -  A node whose next step is an architecture decision is parked rather than
    made ready, because recording a costly-to-reverse choice is maintainer
    judgment. That covers `globalthis-binding`, which needs the decision
    reconciling a mutable global object with closed-world name resolution, and
    `regexp-matcher-backend-probes`, which ends in the backend selection
    [*PLAN-REGEXP.md*](./PLAN-REGEXP.md) defers until its probes compare the
    candidates. `atomics-and-shared-memory` is parked for a missing capability
    instead: agent clusters and shared memory have no `$262` harness support.

The graph admits no language semantics of its own. Implemented M5b node
`builtin-code-registry` reserves one stable 256-ID range for each runtime
component that owns built-in functions and delegates those ranges through a
table to component-owned dispatchers. Adding an entry within one component no
longer renumbers other components or extends the generic dispatch chain. The
node claims no test262 inventory roots and admits no semantic family, so it
adds structural registry evidence without a language-profile record, property
seed, native semantic fixture, or standards promotion.

Implemented M5b node
`error-aggregate-and-options` admits `AggregateError`, its iterable `errors`
list, and error constructor `cause` options through the external node workflow.
Its fifteen reviewed promotions move the manifest to 2,949 passes across 4,876
paths without changing the graph's orchestration state.

Implemented M5b node `well-known-symbols` extends the realm-owned table from
four entries to the complete thirteen-symbol edition set. Directly generated
and fixed native differential evidence covers stable identities, descriptions,
and fixed constructor descriptors under both specialization policies and
forced collection. The reviewed node inventory contains thirteen passes and
fifteen unsupported prerequisite cases. Its nine new passes and fourteen new
unsupported classifications move the manifest to 2,958 passes across 4,899
paths without changing the graph's orchestration state.

Implemented M5b node `intrinsic-graph-root` replaces the component-local
intrinsic caches and name-compared virtual properties with one realm-owned,
collector-traced table. `%Object.prototype%`, callable
`%Function.prototype%`, and the already admitted constructors become reachable
through ordinary prototype links without admitting the later prototype-method,
constructor, global-object, or `super-without-extends` nodes. Fixed native
differential evidence and the generated domain at seed `0x60003100` cover both
specialization policies, forced collection, shared method identity, and
explicit prototype replacement. The node owns no test262 inventory roots, so
the 4,899 reviewed paths and 2,958 passes do not move. The public runtime ABI
moves to `oseo-runtime-m5-46` without changing the graph's orchestration state.

Implemented M5b node `object-prototype` populates the realm-owned
`%Object.prototype%` with `hasOwnProperty`, `isPrototypeOf`,
`propertyIsEnumerable`, `toString`, `toLocaleString`, `valueOf`, and its
`constructor` link. Callable `Object` behavior and primitive wrappers remain
owned by their later node. Fixed native and generated differential evidence at
seed `0x60003200` covers both specialization policies, forced collection, and
deliberate shape-guard misses that reach generic lookup. All 179 paths under
the node's sole promotion root are reviewed: 58 pass and 121 retain explicit
prerequisite boundaries. The manifest moves to 3,016 passes across 5,078 paths,
and the runtime ABI moves to `oseo-runtime-m5-47`, without changing the graph's
orchestration state.

Implemented M5b node `function-prototype` completes the callable realm root
with `call`, `apply`, `bind`, `toString`, `Symbol.hasInstance`, the `Function`
constructor identity, and the restricted accessors backed by the existing
`%ThrowTypeError%`. Dynamic source and primitive wrappers remain explicit
later-node boundaries. Fixed native and generated differential evidence at
seed `0x60003300` covers both specialization policies, forced collection,
bound construction, custom has-instance dispatch, and deliberate shape-guard
misses. All 344 paths under the node's four inventory roots are reviewed: 123
pass and 221 retain explicit prerequisite boundaries. Two existing
global-binding cases also become passes. The manifest moves to 3,141 passes
across 5,422 paths, and the runtime ABI moves to `oseo-runtime-m5-48`, without
changing the graph's orchestration state.

Implemented M5b node `iterator-intrinsic` materializes `%Iterator%`,
`%IteratorPrototype%`, `Iterator.from`, and the wrap-for-valid-iterator object
that later helper methods extend. `Iterator.from` captures `next` once,
preserves an iterator that already inherits from `%IteratorPrototype%`, and
otherwise forwards `next` and a dynamically retrieved `return` through the
collector-traced wrapper. Fixed native and generated differential evidence at
seed `0x60003400` covers both specialization policies, forced collection,
direct and iterable inputs, late `return` lookup, and deliberate shape-guard
misses. All 37 paths under the node's six inventory roots are reviewed. They
retain the honest `iterator-helpers` feature boundary until the later helper
method nodes complete that upstream feature tag, so the manifest moves to
5,459 paths with 3,141 passes and 963 unsupported profile features. The
runtime ABI moves to `oseo-runtime-m5-49` without changing the graph's
orchestration state.

Implemented M5b node `number-intrinsic` materializes the `Number` constructor,
its branded wrapper objects, numeric constants, predicate statics, parser
statics, and standard global-object property. Fixed native and generated
differential evidence at seed `0x60003500` covers both specialization policies,
forced collection, string and BigInt conversion, parser prefixes, false
numeric hints, and deliberate shape-guard misses. All 172 paths under the
node's eleven inventory roots are reviewed: 135 pass and 37 retain explicit
prerequisite boundaries. Twenty-four existing cross-family cases also become
passes once their Number prerequisites are present, so the manifest moves to
5,631 paths with 3,300 passes and 976 unsupported profile features. The runtime
ABI moves to `oseo-runtime-m5-50` without changing the graph's orchestration
state.

Implemented M5b node `object-constructor` makes `Object` a callable and
constructible global intrinsic, adds collector-traced primitive wrappers and
String wrapper properties, and implements `Object.is`,
`Object.getPrototypeOf`, and `Object.setPrototypeOf`. Fixed native and
generated differential evidence at seed `0x60003600` covers both
specialization policies, forced collection at every safepoint, false hints,
guard hits and misses, generic fallback, derived construction, primitive
wrapping, prototype mutation, and global `Object` replacement. All 139 paths
under the node's five inventory roots are reviewed: 76 pass and 63 retain
explicit prerequisite boundaries. A further 195 previously reviewed cases
move from unsupported to pass because the real `Object` value and its
prototype operations satisfy their prerequisites. The manifest moves to 5,770
paths with 3,571 passes, 1,355 expected negatives, and 844 unsupported profile
features. The public intrinsic table and primitive wrapper state move the
runtime ABI to `oseo-runtime-m5-51` without changing the graph's orchestration
state.

Implemented M5b node `object-define-property` admits
`Object.defineProperty` over the existing property-key and descriptor
components. Target validation precedes property-key coercion, which precedes
descriptor conversion in the specified field order. Attribute defaults,
data/accessor exclusivity, incompatible changes, abrupt completion, and
ordinary and exotic mutation preserve their existing generic behavior. Fixed
native and generated differential evidence at seed `0x60003700` covers both
specialization policies, forced collection at every safepoint, false hints,
generic fallback, primitive targets, arrays, functions, arguments aliases,
String wrappers, symbols, and module namespace descriptor compatibility. The
reviewed property helper provides the admitted legacy descriptor verifiers, so
missing harness bindings do not count as profile gaps. All 1,131 paths under
the node's inventory root are reviewed: 965 pass and 166 retain explicit
prerequisite boundaries. The manifest moves to 6,901 paths with 4,556 passes,
1,355 expected negatives, and 990 unsupported profile features. The completed
descriptor checkpoint moves the runtime ABI to `oseo-runtime-m5-52` without
changing the graph's orchestration state.

Implemented M5b node `promise-intrinsic` makes `Promise` a materialized
realm value. The constructor is an ordinary constructible function the
global object binds as a writable, non-enumerable, configurable property,
so `new Promise`, `Promise.resolve`, and every other static now run as
ordinary construction and method calls instead of the M4 fast paths the
frontend recognized by name. A promise takes its `[[Prototype]]` from the
new target, `Promise.prototype` carries `constructor`, `Symbol.toStringTag`,
`then`, `catch`, and `finally`, and `%Promise%` carries the
`Symbol.species` accessor together with `resolve`, `reject`,
`withResolvers`, `try`, `all`, `race`, `allSettled`, and `any`. A capability
over any constructor other than `%Promise%` is a three-slot record built by
NewPromiseCapability, which `then` and `finally` reach through
SpeciesConstructor, so a subclass observes its own executor and resolving
functions. Fixed native and generated differential evidence at seed
`0x60003800` covers both specialization policies, forced collection at every
safepoint, false hints, deliberate shape-guard misses, generic fallback,
subclass and foreign capabilities, throwing and non-constructor species,
and global `Promise` replacement and deletion. `Promise.all` and
`Promise.race` now build their capability from the `this` value; the
remaining combinator work stays with its own graph node. The reviewed subset
admits the `promise-try` and `promise-with-resolvers` feature tags, so both
statics execute their upstream cases rather than reporting an unadmitted
feature. Of the 250 paths under the node's seven inventory roots, 238 are
reviewed: 183 pass and 55 retain explicit prerequisite boundaries. The
remaining twelve name the
*promiseHelper.js* include, the unhandled-rejection host policy, and the
`PromiseResolve` constructor read. Thirteen previously reviewed cases also move
from unsupported to pass because a real `Promise` value satisfies their
prerequisites. The manifest moves to 7,111 paths with 4,750 passes, 1,355
expected negatives, and 1,006 unsupported profile features. Materializing the
intrinsic retires the `oseo_promise_construct`, `oseo_promise_race`, and
`oseo_promise_reject` generated-code entry points and moves the runtime ABI to
`oseo-runtime-m5-53` without changing the graph's orchestration state.

Implemented M5b node `object-descriptor-queries` completes the descriptor
checkpoint's reporting half over the existing property-key and descriptor
components. `Object.getOwnPropertyDescriptor` and the new
`Object.getOwnPropertyDescriptors` convert their target before their property
key, report an absent property as `undefined` and a target with no own
property as an empty ordinary object, and build every reported descriptor
through one FromPropertyDescriptor body that keeps the specified field order
for data and accessor properties alike. The plural static walks ordinary own
keys, so integer indices lead in ascending numeric order, the array `length`
and function `prototype` this runtime keeps outside the property vector hold
their creation positions, and symbol keys trail every string key. Fixed
native and generated differential evidence at seed `0x60003900` covers both
specialization policies, forced collection at every safepoint, false hints,
deliberate shape-guard misses, generic fallback, primitive and wrapper
targets, arrays, functions, classes, arrows, arguments objects, symbol keys,
and abrupt key conversion. Of the 328 paths under the node's two inventory
roots, 313 are reviewed: 163 pass and 150 retain explicit prerequisite
boundaries for unadmitted standard globals, the `Function` constructor,
`Proxy` and `Reflect`, and `Object.getOwnPropertySymbols`. The remaining
fifteen observe the global object's standard function and value properties
and the `Number` prototype's formatting methods, so they stay outside the
reviewed subset until the nodes that own those values land. The manifest
moves to 7,421 paths with 4,910 passes, 1,355 expected negatives, and 1,156
unsupported profile features. Completing the descriptor checkpoint's
reporting half moves the runtime ABI to `oseo-runtime-m5-54` without
changing the graph's orchestration state.

Implemented M5b node `array-buffer` materializes `%ArrayBuffer%` and adds the
runtime's first state that is host memory rather than traced values. The
constructor runs ToIndex over its length, reads `maxByteLength` from an object
options bag, compares the two before it reads the new target's `prototype`,
and allocates one zero-initialized Data Block that exactly one buffer owns. A
resizable buffer reserves its whole maximum up front, so `resize` moves the
byte length inside a block that never moves and clears the bytes outside it in
both directions. `transfer` and `transferToFixedLength` allocate a second block
and copy before detaching the source, so no block is reachable from two
buffers and a failed allocation leaves the source intact; the single release
path leaves a record detached, so the collector cannot free a block a transfer
already gave up. `slice` clamps its bounds, allocates through
SpeciesConstructor, and re-checks the source after the species ran. The four
state accessors report the detached state rather than throwing, `isView` is
`false` for every value this profile can produce, and the constructor carries
the `Symbol.species` accessor. Fixed native and generated differential
evidence at seed `0x60003a00` covers both specialization policies, forced
collection at every safepoint, false hints, deliberate shape-guard misses,
generic fallback, every ToIndex conversion class, the option bag's abrupt
orders, brand rejection, resize in both directions, both transfers over eight
source and target shapes, fifteen slice ranges, ten species outcomes, and a
collection-pressure loop around a survivor and a transferred store. All 192
paths under the node's inventory root are reviewed: 128 pass and 64 retain
explicit prerequisites for `Reflect`, `SharedArrayBuffer`, `DataView`,
TypedArray constructors, `Object.isExtensible`, and other unadmitted standard
globals. The manifest moves to 7,613 paths with 5,038 passes, 1,355 expected
negatives, and 1,220 unsupported profile features. The reviewed harness gains
`detachArrayBuffer.js` and records `resizableArrayBufferUtils.js` as
unavailable. The new component and heap kind move the runtime ABI to
`oseo-runtime-m5-55` without changing the graph's orchestration state.

Implemented M5b node `object-integrity-levels` exposes the extensibility flag
reserved by the intrinsic graph root and admits `Object.preventExtensions`,
`Object.seal`, `Object.freeze`, `Object.isExtensible`, `Object.isSealed`, and
`Object.isFrozen`. SetIntegrityLevel routes stored property transitions
through the existing descriptor component, so ordinary objects, mapped
arguments, String wrappers, and module namespaces retain their generic
compatibility rules. Array `length` and function `prototype` keep their
specialized storage while participating in TestIntegrityLevel and freezing.
Fixed native and generated differential evidence at seed `0x60003c00` covers
both specialization policies, forced collection at every safepoint, false
hints, deliberate shape-guard hits and misses, generic fallback, primitive
arguments, arrays, functions, arguments aliases, String wrappers, and
collection pressure. Of the 317 paths under the node's six inventory roots,
314 are reviewed: 206 pass and 108 retain explicit prerequisite boundaries.
The other three construct source dynamically through a function constructor,
so ADR 0016 keeps them outside the reviewed subset. Nineteen previously
reviewed cases also move from unsupported to pass because they now observe
the admitted extensibility state. The manifest moves to 7,927 paths with
5,263 passes, 1,355 expected negatives, and 1,309 unsupported profile
features. The runtime ABI moves to `oseo-runtime-m5-56` without changing the
graph's orchestration state.

Implemented M5b node `global-object-record` installs `Infinity`, `NaN`, and
`undefined` as non-writable, non-enumerable, non-configurable properties of
the realm global object. It also installs every constructor global the profile
admits before GlobalDeclarationInstantiation. That instantiation carries
Script lexical names to HasRestrictedGlobalProperty and validates every
function and `var` name against existing descriptors and extensibility before
mutation. A declaration over an existing configurable property retains the
property as Object Environment Record storage, so deletion, accessors, and
later descriptor changes remain visible through the identifier. Module and
function-local declarations remain declarative bindings, and the node does not
expose the global object through a `globalThis` binding. Every admitted
configurable constructor global uses that same property-owned identifier path,
including reads and writes after an object-property change and the
ReferenceError or `typeof` result after deletion. HIR and MIR retain each
global declaration's source range, so restricted-property and declaration
permission failures report the declaration that failed. Fixed native and
generated differential evidence at seed `0x60003d00` covers both
specialization policies, forced collection at every safepoint, descriptor
identity, intrinsic collisions, strict and non-strict writes, deletion,
accessor replacement, inherited binding lookup, `with` fallback, failed
installation retry, restricted declarations, non-extensible creation,
deliberate shape-guard hits and misses, and generic fallback. Of the 62 paths
under the node's four inventory roots, 59 are reviewed: 25 pass, 9 are expected
negatives, and 25 retain explicit prerequisite boundaries. One path was
already reviewed, so the node adds 58 manifest entries. The other three depend
on the separately owned `Array` global or Module import and export parsing.
Dynamic-source and closed-world unresolved-name cases keep their explicit
boundaries. The manifest remains at 7,985 paths with 5,288 passes, 1,364
expected negatives, and 1,333 unsupported profile features. The follow-up
runtime ABI moves to `oseo-runtime-m5-59` without changing the graph's
orchestration state.

Implemented M5b node `object-define-properties` admits
`Object.defineProperties` over the property-key, descriptor, and own-key
components the descriptor checkpoint already landed. The target check
precedes every read of the properties argument, ToObject precedes the own
enumerable key walk, and each kept key's descriptor is read with Get and
converted through the one shared ToPropertyDescriptor body before the first
definition mutates the target. An abrupt collection therefore leaves the
target untouched, while an abrupt definition keeps every earlier definition
and stops every later one. The collected descriptors apply in ordinary
own-key order through the shared DefinePropertyOrThrow body, so ordinary
objects, arrays, functions, arguments aliases, String wrappers, symbol keys,
and module namespaces keep their existing generic compatibility rules, and a
module namespace serves as the properties argument through its binding
cells. Fixed native and generated differential evidence at seed `0x60003e00`
covers both specialization policies, forced collection at every safepoint,
false hints, deliberate shape-guard misses, generic fallback, colliding
integer and string key orders, every optional descriptor field, abrupt
getters, mixed and non-object descriptors at each collection position, and
namespace sources and targets. All 632 paths under the node's inventory root
are reviewed: 540 pass and 92 retain explicit prerequisite boundaries for
unadmitted standard globals, `Proxy`, and the `Reflect.construct` harness
check. The manifest moves to 8,617 paths with 5,828 passes, 1,364 expected
negatives, and 1,425 unsupported profile features. The completed collection
checkpoint moves the runtime ABI to `oseo-runtime-m5-60` without changing
the graph's orchestration state.

Implemented M5b node `array-constructor` makes `Array` a replaceable intrinsic
value and completes its realm cluster with length-argument construction,
`Symbol.species`, `from`, `of`, and `isArray`. `Array.from` constructs a custom
receiver before iterator acquisition and closes an acquired iterator on abrupt
mapping or indexed definition. Fixed native and generated differential evidence
at seed `0x60003f00` covers both specialization policies, forced collection,
generic constructor receivers, false hints, and deliberate shape-guard misses.
Of the node's 176 inventory paths, 174 are reviewed: 145 pass and 29 retain
explicit prerequisite boundaries. Two cases owned by later Array prototype
methods use the fixed and generated `Array.from` evidence as their replacement.
One hundred forty existing dependency cases also become passes. The manifest
moves to 6,113 passes across 8,791 paths, and the runtime ABI moves to
`oseo-runtime-m5-61`, without changing the graph's orchestration state.

Implemented M5b node `string-intrinsic` makes `String` a materialized realm
value. The constructor is an ordinary constructible function the global
object binds as a writable, non-enumerable, configurable property, so
`new String` and every static run as ordinary construction and method calls.
Calling `String` converts through the shared `ToString`, except that a Symbol
argument renders SymbolDescriptiveString rather than throwing; constructing
it brands the receiver the new target produced with `[[StringData]]` and
gives it the exotic own properties, meaning one non-writable,
non-configurable, enumerable property per UTF-16 code unit and a
non-writable, non-enumerable, non-configurable `length`.
`%String.prototype%` is itself such an object over the empty String, so
`Object.prototype.toString` reports `[object String]` for either.
Sixteen selected ES5-era methods remain deferred behavior, but their ordinary
function properties carry the specified descriptors and report the owned M5b
boundary when called, matching the Array constructor checkpoint's boundary
functions.
`String.fromCharCode` applies `ToUint16` in argument order,
`String.fromCodePoint` validates each code point and encodes an astral one as
a surrogate pair while preserving a lone surrogate, and `String.raw` follows
the specified `ToObject`, `raw`, LengthOfArrayLike, and alternating
conversion order. Fixed native and generated differential evidence at seed
`0x60004000` covers both specialization policies, forced collection at every
safepoint, false hints, deliberate shape-guard misses, generic fallback, lone
surrogates, astral code points, coercion order, and global `String`
replacement and deletion. The reviewed subset admits the
`String.fromCodePoint` feature tag, so that static executes its upstream
cases rather than reporting an unadmitted feature. Of the 150 paths under the
node's four inventory roots, 145 are reviewed: 114 pass and 31 retain
explicit prerequisite boundaries; the remaining five call the materialized
`String.prototype.charCodeAt` boundary, whose behavior no admitted
prototype-method node implements yet.
Ninety-four previously reviewed cases also move from unsupported to pass
because a real `String` value and the descriptor-complete boundary for those
methods satisfy their prerequisites. The manifest moves to 8,936 paths with
6,321 passes, 1,364 expected negatives, and 1,251 unsupported profile features.
Materializing the intrinsic adds no generated-code entry point and moves the
runtime ABI to `oseo-runtime-m5-62` without changing the graph's orchestration
state.

Implemented M5b node `string-prototype-access` gives the existing
`%String.prototype%` ordinary `at`, `charAt`, `charCodeAt`, `codePointAt`,
`toString`, and `valueOf` functions without recreating the realm-owned
constructor or its existing prototype link. The four access methods preserve
receiver-before-position coercion, generic receiver conversion,
`ToIntegerOrInfinity`, UTF-16 code-unit indexing, negative `at` positions,
the specified out-of-range results, and surrogate-pair decoding for
`codePointAt`. `toString` and `valueOf` enforce the String primitive or
`[[StringData]]` brand and reject every other receiver. The other fourteen
materialized prototype methods keep their source-located M5b boundary.

Fixed native and generated differential evidence at seed `0x60004100` covers
both specialization policies, forced collection at every safepoint, false
hints, deliberate shape-guard misses, generic fallback, primitive and generic
receivers, branded wrappers, abrupt coercions, and UTF-16 edge cases. All 105
paths under the node's inventory roots are reviewed: 89 pass and 16 retain
explicit prerequisite boundaries for dynamic source, realms, unadmitted
built-in constructors, constructor detection, or later String methods.
Thirty-two previously reviewed dependency cases also become passes. The
manifest moves to 9,041 paths with 6,442 passes, 1,364 expected negatives, and
1,235 unsupported profile features. The admitted runtime checkpoint moves the
runtime ABI to `oseo-runtime-m5-63` without adding a generated-code entry point
or changing the graph's orchestration state.

Implemented M5b node `array-prototype-iterative` gives the realm-owned
`%Array.prototype%` ordinary `every`, `forEach`, and `some` functions. Each
method converts its receiver, snapshots LengthOfArrayLike, validates the
callback, and then performs HasProperty and Get for every visited index. The
callback receives the value, index, and converted receiver with the supplied
`thisArg`. `every` and `some` preserve their specified early result, while
`forEach` ignores the callback result and returns `undefined`. A deletion,
future creation, inherited property, or length change during a callback is
therefore observed without extending the initial iteration range.

Fixed native and generated differential evidence at seed `0x60004200` covers
both specialization policies, forced collection at every safepoint, a false
hint, a deliberate shape-guard miss, generic fallback, sparse and generic
receivers, callback order, early completion, abrupt completion, and mutation
during iteration. Of the 627 paths under the node's three inventory roots, 615
are reviewed: 541 pass and 74 retain explicit prerequisite boundaries. Twelve
resizable-buffer cases require unreviewed TypedArray or harness support. The
review also corrects static array elements to use CreateDataProperty, so an own
element overrides an inherited accessor before an iterative method retrieves
it. The manifest moves to 9,656 paths with 6,983 passes, 1,364 expected
negatives, and 1,309 unsupported profile features. The admitted runtime
checkpoint moves the runtime ABI to `oseo-runtime-m5-64` without adding a
generated-code entry point or changing the graph's orchestration state.

Implemented M5b node `string-prototype-search-and-slice` adds ordinary
`concat`, `indexOf`, `lastIndexOf`, `includes`, `startsWith`, `endsWith`,
`slice`, and `substring` functions to the existing `%String.prototype%`.
Every method converts its receiver before later operands. `concat` converts
arguments in order; the search methods convert the search value before the
position; the three predicate methods perform `IsRegExp` before converting
their search value; and the two extraction methods convert their start before
their end. The implementation matches UTF-16 code units and applies each
method's specified integer conversion, default, relative-index rule, clamp,
and `substring` endpoint swap.

Fixed native and generated differential evidence at seed `0x60004300` covers
both specialization policies, forced collection at every safepoint, false
hints, deliberate shape-guard misses, generic fallback, primitive and generic
receivers, `@@match`, abrupt conversions, empty searches, and UTF-16 edge
cases. All 253 paths under the node's inventory roots are reviewed: 217 pass
and 36 retain explicit prerequisite boundaries for dynamic source, realms,
unadmitted built-in constructors, constructor detection, or RegExp objects.
Six previously reviewed dependency cases also become passes. The manifest
moves to 9,909 paths with 7,206 passes, 1,364 expected negatives, and 1,339
unsupported profile features. The admitted runtime checkpoint moves the
runtime ABI to `oseo-runtime-m5-65` without adding a generated-code entry point
or changing the graph's orchestration state.

Implemented M5b node `array-prototype-species-mapping` gives the realm-owned
`%Array.prototype%` ordinary `map` and `filter` functions over the same
snapshot-length HasProperty and Get iteration contract. After receiver and
length conversion and callback validation, each method calls
ArraySpeciesCreate. An Array receiver therefore performs the specified
`constructor` read followed, when that value is an object, by the
`Symbol.species` read. An absent, `undefined`, or `null` species selects the
realm Array; a custom constructor receives the requested result length; and a
non-constructor or abrupt read throws. A generic receiver selects the realm
Array without either observable read. `map` preserves indices and holes in a
result created at the snapshot length, while `filter` creates at length zero
and compacts selected values in visit order.

Fixed native and generated differential evidence at seed `0x60004400` covers
both specialization policies, forced collection at every safepoint, sparse
and generic receivers, default and custom species, abrupt reads, mutation,
false hints, deliberate shape-guard misses, and generic fallback. All 458
paths under the node's two inventory roots are reviewed: 390 pass and 68
retain explicit prerequisite boundaries. The manifest moves to 10,367 paths
with 7,596 passes, 1,364 expected negatives, and 1,407 unsupported profile
features. The admitted runtime checkpoint moves the runtime ABI to
`oseo-runtime-m5-66` without adding a generated-code entry point or changing
the graph's orchestration state.

Implemented M5b node `promise-all-and-race` completes both combinators over
the materialized constructor. Each static builds NewPromiseCapability from its
receiver, reads that constructor's `resolve` once before acquiring the
iterator, and calls the captured method with the constructor as receiver for
every iterated value. `Promise.all` retains one guarded fulfillment closure per
index and one shared capability rejection function, preserving input order
independently of settlement order. `Promise.race` shares both capability
settlement functions and leaves an empty input pending. Its outer abrupt paths
use the same first-settlement guard, so a thenable assimilation job queued by
the first resolution wins over a later `then` getter or iterator-step throw.
An abrupt resolve call, `then` getter, or `then` call closes an unfinished
iterator before rejection while preserving the original throw completion; an
abrupt iterator step or value read and final capability resolution retain the
iterator's completed state without closing it. `Promise.all` creates own result
data properties without invoking inherited indexed setters.

Fixed native and generated differential evidence at seeds `0x60004500` and
`0x60004501` covers
empty, sparse, array, and custom iterables, bounded thenable schedules,
subclass and species behavior, both specialization policies, forced collection
at every safepoint, false hints, deliberate guard misses, generic fallback,
first settlement before later abrupt completion, inherited indexed setters,
and observable constructor, resolve, and iterator operations. The reviewed
*promiseHelper.js* harness executes all 16 scheduling cases that use it. Of the
192 paths under the node's two inventory roots, 190 are reviewed: 173 pass and
17 retain explicit prerequisite boundaries for the unhandled-rejection host
policy, `eval`, other profile syntax, `Object.getOwnPropertyNames`, or
`Reflect.construct`. The two remaining paths require string iteration and stay
with the separate `string-iterator` node; fixed and generated evidence covers
the combinators' empty-input contracts. The manifest moves to 10,548 paths with
7,760 passes, 1,364 expected negatives, and 1,424 unsupported profile features.
The admitted runtime checkpoint moves the runtime ABI to `oseo-runtime-m5-67`
without adding a generated-code entry point or changing the graph's
orchestration state.

Implemented M5b node `string-prototype-match-and-split` gives the realm-owned
`%String.prototype%` ordinary `match`, `matchAll`, `search`, and `split`
functions. Object operands dispatch through `Symbol.match`,
`Symbol.matchAll`, `Symbol.search`, or `Symbol.split` before fallback
conversion. `matchAll` performs `IsRegExp`, observes `flags` for a true
`@@match` result, and requires `g` before dispatch. Fallbacks preserve
receiver and operand conversion order, match result metadata, nonoverlapping
iteration with empty-match progress, `ToUint32` split limits, empty subjects
and separators, and separator conversion before the zero-limit result.

The fallback now applies RegExp matching for its admitted fixed-width grammar:
literal code units, dot, escaped syntax, control, hexadecimal, Unicode, digit,
word, and whitespace atoms. Every other RegExp construct reaches a
source-located `OSEO2001` boundary owned by `regexp-pattern-ast` and
`regexp-generic-matcher`; no accepted pattern is treated as a literal
approximation. A hexadecimal or Unicode escape without its required digits
reaches that boundary, while a trailing backslash throws `SyntaxError` as an
invalid pattern. `matchAll` returns a collector-traced RegExp String iterator
whose own prototype supplies `next`, inherits the realm's iterator prototype,
and remains independent from the mutable Array iterator prototype.

Fixed native and generated differential evidence at seeds `0x60004600` and
`0x60004601` covers
both specialization policies, forced collection at every safepoint, false
hints, deliberate shape-guard misses, generic fallback, primitive and generic
receivers, all four protocols, null methods, match metadata and iteration,
metacharacter and escaped patterns, code-unit empty-match advancement, iterator
prototype isolation, split limits, and abrupt conversion. All 239 paths under
the node's four inventory roots are reviewed: 130 pass and 109 retain
explicit prerequisite boundaries. The two null-method cases whose fallback
object dynamically produces the RegExp pattern `\d` were outside the subset
in the previous checkpoint. Both now pass with fixed and generated
replacement evidence for the fallback contract. The combined manifest moves
to 10,787 paths with 7,890 passes, 1,364 expected negatives, and 1,533
unsupported profile features. The admitted runtime checkpoint moves the
runtime ABI to `oseo-runtime-m5-68` without adding a generated-code entry point
or changing the graph's orchestration state.

Implemented M5b node `array-prototype-copying` gives the realm-owned
`%Array.prototype%` ordinary `concat`, `flat`, `flatMap`, `join`, `slice`,
`toLocaleString`, and `toString` functions. Each method converts the receiver
before its later method-specific work, and each copying or stringification
loop obtains LengthOfArrayLike at its specified point. Sparse copying checks
HasProperty before Get, while stringification retrieves every index and
renders nullish elements as empty fields. `concat` observes
`Symbol.isConcatSpreadable`; `concat`, `flat`, `flatMap`, and `slice` use
ArraySpeciesCreate and preserve constructor and `Symbol.species` reads,
default allocation, custom constructors, and abrupt completion.

FlattenIntoArray skips holes, maps before testing the mapped value for Array
flattening, and applies the requested recursive depth. Cyclic or unbounded
input reaches the deterministic runtime call-depth boundary rather than the
native stack. `join` converts its separator after length and safely renders
nested Arrays. `toLocaleString` calls each non-nullish element method with the
element as receiver, forwards the outer locales and options as exactly two
arguments, and coerces its result. Omitted outer arguments are forwarded as two
`undefined` values. During element conversion, re-entry through `join`,
`toString`, or `toLocaleString` on the same active receiver renders an empty
string. Matching Node.js and Deno, these methods and ordinary string conversion
that reaches intrinsic Array `toString` reject lengths above `2**32 - 1` with
`TypeError`. Runtime string construction rejects results above 536,870,888
UTF-16 code units with `RangeError`.
`toString` calls a callable `join` or falls back to
`Object.prototype.toString`. The implementation stays in
*runtime\_array.c* because these paths share property primitives, species
allocation, collector roots, and recursion state with the Array intrinsic.

Fixed native and generated differential evidence at seed `0x60004700` covers
both specialization policies, forced collection at every safepoint, sparse and
generic receivers, side-effect order, spreadability, every species guard hit
and miss, custom results, recursion and cycles, locale argument forwarding,
locale coercion, cyclic locale conversion, oversized-length rejection,
large-length index access ordering, abrupt completion, false hints, deliberate
shape-guard misses, and generic fallback. Of the 229 paths under the node's
seven inventory roots, 228 are reviewed: 181 pass and 47 retain explicit
prerequisite boundaries. The pinned *invoke-element-tolocalestring.js* case
asserts the non-ECMA-402 fallback's zero-argument call and is omitted because
this method follows the ECMA-402 superseding call contract; the fixed
differential fixture replaces its element-call evidence. No new path outside
those roots is added. Two already-reviewed cases outside the roots move from
unsupported to pass because they exercise the newly admitted `toString` and
generic `slice` behavior. The manifest moves to 11,015 paths with 8,073 passes,
1,364 expected negatives, and 1,578 unsupported profile features. The admitted
runtime checkpoint moves the runtime ABI to `oseo-runtime-m5-69` without adding
a generated-code entry point or changing the graph's orchestration state.

Implemented M5b node `map-intrinsic` completes the realm-owned `%Map%`
constructor together with SameValueZero-keyed `[[MapData]]` storage,
insertion order, and `%MapIteratorPrototype%`. The constructor reads the
target's `set` method once through AddEntriesFromIterable and calls it for
every iterated two-element entry, closing an unfinished iterable on a
non-object entry, an abrupt element read, or an abrupt `set` call while
preserving the original throw completion. `set` normalizes a `-0` key to
`+0`; `delete` and `clear` mark a record dead in place instead of removing
it, so a live `%MapIteratorPrototype%.next` walking the same array by index
never skips or misaligns past a concurrent mutation, and a key deleted and
re-added reappears at the end of insertion order. `forEach` re-reads the
entry array on every step, so a `set` call from inside the callback that
grows the backing storage is still observed, and it always returns
`undefined` regardless of the callback's return value. `Map.groupBy` builds
its result directly into a fresh map's records instead of through an
observable `set` lookup, and the `Symbol.species` accessor returns its
receiver unchanged.

Fixed native and generated differential evidence at seed `0x60004800` covers
SameValueZero identity across canonical zero, NaN, a string, and two
distinct object identities, insertion order, in-place tombstone deletion,
both specialization policies, forced collection at every safepoint, false
hints, deliberate guard misses, generic fallback, and observable
constructor, iterator, and `forEach` re-entrancy operations. Of the 182
paths under the node's two inventory roots, 181 are reviewed: 147 pass and
34 retain explicit prerequisite boundaries for constructor detection, the
unimplemented `Set`, `WeakMap`, `WeakSet`, and `WeakRef` collection
intrinsics, `Array.prototype.pop`, or realm creation. The remaining path
requires string iteration and stays with the separate `string-iterator`
node. One previously reviewed case, *test/built-ins/Object/seal/seal-map.js*,
also moves from unsupported to pass because `Object.seal` now observes a
real `Map` instance instead of an unresolved global. The combined manifest
moves to 11,196 paths with 8,221 passes, 1,364 expected negatives, and
1,611 unsupported profile features. The admitted runtime checkpoint moves
the runtime ABI to `oseo-runtime-m5-70` without adding a generated-code
entry point or changing the graph's orchestration state.

Implemented M5b node `number-prototype` replaces the placeholder `toString`
and `valueOf` bodies with real ones and adds `toFixed`, `toExponential`,
`toPrecision`, and `toLocaleString`. Every method shares one
`thisNumberValue` brand check admitting only a Number primitive or wrapper.
`toString`'s radix 10 case reuses the existing shortest round-trip decimal
algorithm; radix 2 through 36 convert the receiver's exact mantissa and
binary exponent through a new bignum, rendering the integer part exactly and
advancing the remaining fraction against the distance to the rounding
boundary on each side, which differ at a power of two, and stopping once the
tail no longer exceeds that budget. That is the round-trip stopping rule
rather than a shortest-string search, and the tie test inspects the final
digit, both of which ECMA-262 leaves to the implementation here.

Because ECMA-262 leaves a non-decimal
radix implementation-approximated and V8 advances its fraction in floating
point, a non-terminating expansion can differ from V8 in its trailing
digits: over a 767-case sweep spanning binade boundaries, the smallest
denormal, and random bit patterns, 280 differed, every Oseo result read back
as the original double and 229 of V8's did not, so this node keeps the exact
result and records the divergence rather than reproducing V8's arithmetic.
Terminating radices agree exactly.

`toFixed`, `toExponential`, and `toPrecision` round
through the same exact numerator-over-denominator bignum representation
instead of repeated floating-point arithmetic, with the decimal exponent a
significant-digit request needs found by exact bignum comparison against
powers of ten rather than a `log10` estimate, since a value adjacent to a
power-of-ten boundary can round to a self-consistent but wrong digit count
on either side of that boundary under a floating-point guess.
`toLocaleString` returns the base specification's own fallback,
`thisNumberValue` followed by `ToString`, with no ECMA-402
Internationalization API admitted. The generic `ToPrimitive` path's narrow
placeholder for the deferred `Number.prototype.toString` is removed, so the
generic property lookup and call it already used for every other
constructor now reaches this node's real methods. Fixed native and
generated differential evidence at seed `0x60004900` covers both
specialization policies, forced collection at every safepoint, a false
hint, and a deliberate shape-guard miss. Of the 168 paths under the node's
inventory root, 155 pass and 13 retain explicit prerequisite boundaries for
`Reflect.construct`, `Date`, `Boolean`, and the mutable global object.
Completing `valueOf` and `toString` also lets 21 already-reviewed paths
outside this node's own root pass where they previously retained an
unsupported-profile-feature boundary citing the same placeholder; their
entries move with this change since the manifest requires every reviewed
path's classification to match observed evidence. Two of them are the
`Array.prototype.join` cases that take a Number wrapper as `length`, which
the separately landed array-prototype-copying node reviewed while that
placeholder still stood. The combined manifest
moves to 11,364 paths with 8,397 passes, 1,364 expected negatives, and 1,603
unsupported profile features. The admitted runtime checkpoint moves the
runtime ABI to `oseo-runtime-m5-71` without adding a generated-code entry
point or changing the graph's orchestration state.

Implemented M5b node `regexp-pattern-ast` adds the Oseo-owned regular
expression pattern model that
[*PLAN-REGEXP.md*](./PLAN-REGEXP.md) delivery items 1 and 2 define, and
admits no execution. `@oseo/compiler` gains the pattern AST, a parser and
validator over the ECMAScript 2025 main-body pattern grammar, owned
resource limits, and a structural dump. The frontend converts a regular
expression literal into an owned record of its pattern text, flag text, and
source range, validates it there, and retains no bootstrap-parser node. An
invalid pattern or flag set is now an early error located at the offending
text inside the literal instead of one profile diagnostic at the whole
literal; a valid pattern still reports the profile boundary, because
nothing evaluates it.

Annex B is outside the candidate claim, so a construct only Annex B admits,
such as an identity escape over an identifier character, a legacy octal
escape, a quantified assertion, an unescaped `]` or `}`, or an out-of-order
class range, is rejected in every mode rather than accepted without the `u`
flag. Class set notation, inline modifiers, and Unicode property escapes
are recognized and refused with a located `unsupported` error rather than
an early error. Modifiers and property escapes are admitted through a
named extension point when a caller owns their semantics, and admitting a
property escape without a resolver for its name refuses it rather than
accepting a name nothing checked. The compiler core links no
Unicode data, so the parser decides ASCII itself and takes an `ID_Start`
and `ID_Continue` classifier from its caller; a group name or non-unicode
identity escape outside ASCII is refused instead of guessed. Capture count,
nesting depth, quantifier bound, and pattern length have reviewed limits
that report an owned `limit` error rather than exhausting a host stack.

Focused parser, validator, printer, limit, extension, and frontend
diagnostic evidence covers every early error the grammar defines with its
exact message and span. Generated evidence at seeds `0x60004a00` and
`0x60004a01` keeps a structured pattern model until it prints source; the
host engine is an independent oracle for validity, capture count, and group
names, and a summary walk over the model is compared with one over the
parsed tree. The invalid domain applies one mutation to a valid case and
asserts the exact kind, section, and span it must produce, over pattern
and flag violations alike. The generated domain found and fixed one defect: a
surrogate pair escape joined into a supplementary code point without the `u`
flag, which the grammar joins only under UnicodeMode. It is retained as a fixed
regression case. Because the node admits no execution, it claims no language
family, adds no reviewed test262 path, and needs no native, standards, or
forced-collection evidence. The manifest stays at 11,364 paths with 8,397
passes, 1,364 expected negatives, and 1,603 unsupported profile features; the
68 reviewed rows whose recorded detail quoted the old literal diagnostic are
regenerated with the new message, and no classification, phase, or capability
moves. The runtime ABI does not move, and *docs/regexp-inventory.md* records
the clause, directory, flag, prototype, symbol, Unicode, and diagnostic
inventory that delivery item 1 requires. This node adds no reviewed
`regular-expressions` dependency tag. ADR 0013's vocabulary is extensible
through a reviewed amendment to that record, and a later amendment admits the
tag and adds it to the enforced set without moving any reviewed row.

Implemented M5b node `regexp-generic-matcher` adds the generic matcher
artifact and executor that
[*PLAN-REGEXP.md*](./PLAN-REGEXP.md) delivery item 3 defines, and admits no
execution to a compiled program. `@oseo/compiler` gains
`buildRegExpMatcher`, which compiles one validated pattern into an
immutable instruction artifact, `matchRegExpMatcher` and
`searchRegExpMatcher`, which execute it, and an instruction dump. The
artifact is the semantic authority for the admitted grammar: an
ahead-of-time lowering and any later fast path must reproduce the match
state it produces.

The artifact is a flat program over a register file holding capture pairs,
repetition counters and positions, and lookaround frames. It carries no
mutable field and no reference to a regular expression object, so equal
artifacts may be shared while every evaluation still owns its identity and
`lastIndex`. The executor keeps an explicit backtrack stack and an undo
trail instead of a native call stack, which is what lets a later C lowering
backtrack without recursion; every register write is trailed, so one
backtrack entry restores the whole state by truncating it.

Choice order, capture reset and visibility, edge and word-boundary
assertions, lookaround as an atomic submatch, backreference resolution
across duplicate group names, greedy and lazy priority, empty-progress
failure, and both iteration modes are frozen here. Positions are UTF-16
code-unit indices that always name a code-point boundary under `u` and `v`,
so a start index inside a surrogate pair names the pair and the search
advances past the whole pair. Ignore-case behavior is decided while the
artifact is built: each consuming atom becomes one set closed under the
pattern's canonicalization, and a negated class is complemented after that
closing. Only a backreference compares two input characters at run time, so
only a pattern with both `i` and a backreference carries a canonicalization
table. The two unicode-mode flags complement a property
differently, so `\P{Ll}` accepts a lowercase letter under `iu` and refuses
it under `iv`. An inline modifier group has no matcher lowering and is refused
with a located error, because the unit that admits that syntax owns its flag
scoping. Building and executing report owned `limit` outcomes over
instructions, registers, steps, backtrack entries, and trail entries, and a
lowered limit can only replace an answer with that failure.

The compiler core still links no Unicode data. The builder takes
case-equivalence classes for the pattern's mode, the `Space_Separator`
category, and property escape sets from its caller, owns every ECMAScript
decision made from them, and refuses a pattern whose facts the caller did
not supply. The cross-package suite is that caller: it wires
`@oseo/unicode` in and then compares the derived `WordCharacters` with the
pinned word-character tables and every class escape with the host engine
across the basic plane.

Evidence is focused artifact, executor, refusal, and limit tests with exact
dumps, messages, and spans, a host-differential corpus that runs unchanged
under Node.js and Deno inside ASCII, a cross-package corpus over the pinned
tables, and a generated domain at seeds `0x60004d00` and `0x60004d01` whose
oracles are the host engine and a structural walk over the artifact. The
generated domain found and fixed one defect: a repetition nested in another
one resumed the count it left behind instead of starting over, so the inner
quantifier stopped iterating after the outer body ran once. It is retained
as a fixed regression case. It also isolated one position family the host
does not implement as the edition specifies, a zero-width assertion
evaluated between the two code units of a surrogate pair; that case is
recorded as an example with its derivation and excluded from the generated
oracle.

Because the node admits no execution, it claims no language family, adds no
reviewed test262 path, and needs no native, standards, or forced-collection
evidence. It adds no specialized path, no hint, and no MIR or backend
surface, so the specialization policy cannot reach the matcher; the suite
records that by compiling one literal under both policies. The manifest
stays at 11,441 paths with 8,468 passes. Property domains, seeds, and case
budget move from 91, 91, and 3,982 to 93, 93, and 4,582, and no override is
used. The runtime ABI does not move and no built-in code range is
allocated, because nothing in the runtime reaches the artifact yet;
PLAN-REGEXP.md delivery item 4 links it there.

Implemented M5b node `bigint-intrinsic` materializes the callable `BigInt`
intrinsic, `%BigInt.prototype%`, branded wrapper objects, `asIntN`, `asUintN`,
`toString`, `toLocaleString`, and `valueOf` over the exact primitive admitted
by M5a Unit 8.1a. The call path applies `ToPrimitive` with the number hint once,
converts an integral Number exactly, and otherwise uses one shared `ToBigInt`
operation. Its `[[Construct]]` slot makes `IsConstructor(BigInt)` true for class
heritage and generic constructor selection but throws before converting any
argument, including through a derived constructor. The fixed-width statics
convert their width through `ToIndex` before the operand and perform
width-bounded two's-complement truncation without materializing `2**bits` for
an identity result. The prototype is an ordinary, unbranded object; its methods
admit a BigInt primitive or branded wrapper and reject every other receiver.
Radix text shares the primitive's exact conversion and covers every radix from
2 through 36. The base-specification `toLocaleString` fallback remains
independent of ECMA-402.

The new *runtime\_bigint\_object.c* component owns that object model without
reading a limb. Exact integral-Number conversion, radix text, and fixed-width
truncation remain private `OseoValue` operations in *runtime\_bigint.c*. Fixed
and generated differential evidence covers both reference hosts, both
specialization policies, forced collection at every safepoint, false hints,
guard misses, mutable global binding behavior, every conversion and failure
order, direct and derived construction rejection, generic Array constructor
selection, the 65,536-bit resource ceiling, and a bounded allocation-attempt
sweep. The sweep covers result publication, Number conversion, every radix
staging buffer, wrapper creation, and partial intrinsic initialization, then
collects and retries each attempt to prove cleanup, roots, stable identity, and
complete publication. The generated family uses seed `0x60004b00` in the
reserved block through `0x60004bff` and an independent base-2^15 Number model.
The runtime ABI moves to `oseo-runtime-m5-72`, and built-in code range index 14
is allocated without a gap. No compiler IR, generated-code entry point,
inventory policy, manifest schema, vocabulary, or override changes.

All 77 paths under *test/built-ins/BigInt/* are reviewed: 61 pass and 16 retain
explicit boundaries. Eight need deferred non-BigInt primitive-wrapper methods,
six need `Reflect.construct`, one needs realm creation, and one also reaches the
unadmitted `Date` intrinsic. Four already-reviewed Object paths and six String
paths outside the node root move from unsupported to pass because they now
observe the real intrinsic, wrapper tag, conversion, or symbol-dispatch
behavior. The combined manifest moves from 11,364 to 11,441 paths, from 8,397
to 8,468 passes, keeps 1,364 expected negatives, and moves from 1,603 to 1,609
unsupported profile features, with no semantic, harness, or infrastructure
failures. The suite revision and 41,091-path applicable inventory remain
unchanged.

Implemented M5b node `data-view` materializes `%DataView%` and
`%DataView.prototype%` over the Data Block the `array-buffer` node owns, so a
program can read and write those bytes for the first time. The constructor
requires `new` and an `ArrayBuffer`, runs `ToIndex` over `byteOffset` and then
over `byteLength`, and validates the detached state and both bounds once before
and once after `OrdinaryCreateFromConstructor` reads the new target's
`prototype`. An absent `byteLength` fixes the view's length over a fixed-length
buffer and makes it length-tracking over a resizable one. The three prototype
accessors and the eleven `get` and eleven `set` element accessors recompute the
buffer's detached state and byte length on every call, so a detached or shrunk
buffer produces the specified `TypeError` while `buffer` still reports it.

Each `get` accessor runs `ToIndex`, then `ToBoolean`; each `set` accessor runs
`ToIndex`, then `ToNumber` or `ToBigInt` over the stored value, then
`ToBoolean`. Both then run the out-of-bounds `TypeError` and the range
`RangeError`, so a conversion that detaches or shrinks the buffer still reaches
the specified rejection. A one-byte accessor takes no byte-order parameter: it
passes little-endian directly and runs no `ToBoolean`. Integer element types
wrap modulo the element width in two's complement. Float element types round to
nearest with ties to even in exact integer arithmetic over the operand's own
binary64 encoding, so no narrowing floating conversion and no out-of-range
conversion occurs; `Float64` is bit-preserving, a signed zero keeps its sign,
and a NaN keeps its class. Every element moves through a local byte buffer
rather than a cast, so an unaligned access is ordinary, and every index and
size comparison is written so no host addition can wrap.

The new *runtime\_data\_view.c* component owns that object model and owns no
Data Block: it holds only its buffer's value, the collector keeps the block
alive by tracing that buffer, and nothing in the component allocates, resizes,
or releases a block. It reads no BigInt limb, reaching the representation only
through raw-integer operations *runtime\_bigint.c* exports. `ToIndex` becomes
one shared conversion in *runtime\_primitive.c*, which `ArrayBuffer` now calls
with its own diagnostic, and `ArrayBuffer.isView` reports the one admitted view
kind. Fixed and generated differential evidence covers both reference hosts,
both specialization policies, forced collection at every safepoint, false
hints, guard misses, mutable global binding behavior, every conversion and
failure order, subclass construction, unaligned access at every offset of an
eight-byte element, tracking and fixed-length views across grow and shrink, and
a bounded allocation-attempt sweep over the view record, the intrinsic cluster,
and the BigInt a 64-bit load produces, each collected and retried to prove
cleanup, roots, stable identity, and complete publication. The generated family
uses seed `0x60004c00` in the reserved block through `0x60004cff` with an
independent byte-level model that reads no host `DataView` and no host BigInt.
The runtime ABI moves to `oseo-runtime-m5-73`, and built-in code range index 15
is allocated without a gap. No compiler IR, generated-code entry point,
inventory policy, manifest schema, or override changes.

All 550 paths under *test/built-ins/DataView/* are reviewed: 443 pass and 107
retain explicit boundaries. Thirty-nine need `SharedArrayBuffer`, thirty-two
need `Reflect.construct` or the `Reflect` namespace, thirty need a TypedArray
constructor, four need the deferred non-BigInt primitive-wrapper prototype
methods, and one reaches an unresolvable identifier this profile rejects at
compile time; two of the `Reflect` paths also need a second realm. Five
already-reviewed `ArrayBuffer` paths, one `Array.prototype` path, and one
`Object.seal` path outside that root move from unsupported to pass. The
reviewed feature list gains `DataView`, `Float16Array`, and the eight
`DataView.prototype.*` accessor features this node implements; the reviewed
dependency vocabulary gains `data-view`; and the reviewed harness gains
upstream's *byteConversionValues.js* data table and a
`verifyPrimordialProperty` alias. The combined manifest moves from 11,441 to
11,991 paths, from 8,468 to 8,918 passes, keeps 1,364 expected negatives, and
moves from 1,609 to 1,709 unsupported profile features, with no semantic,
harness, or infrastructure failures. The suite revision and 41,091-path
applicable inventory remain unchanged.

Implemented M5b node `regexp-unicode-property-escapes` admits the six
character class escapes and exact Unicode property escapes over the Unicode
17.0.0 tables pinned by `@oseo/unicode`. The package exports one ECMA-262
resolver for canonical binary property names, lone General\_Category values,
and General\_Category, Script, or Script\_Extensions name-value pairs. The
frontend supplies it through the owned pattern parser's extension boundary,
so valid escapes reach the regular expression evaluation boundary and an
invalid property expression produces an `OSEO0001` diagnostic at the escape.
The compiler core still imports no Unicode package, and the generic matcher
remains semantic authority for complement, Unicode traversal, and ignore-case
closure.

Fixed matcher and native String fallback evidence covers every character class
escape, both reference hosts, both specialization policies, deliberate guard
misses, and forced collection. Three generated domains use seeds `0x60004e00`,
`0x60004e01`, and `0x60004e02` from the reserved block through `0x60004eff`.
They compare class escapes and every canonical property family with the host
engine, except that the retained empty `Hrkt` Script value uses its absence
from the pinned Script and Script\_Extensions assignments as the oracle. They
assert the exact owned diagnostic and span for invalid forms.
Property domains, seeds, and ordinary case budget move from 94, 94, and 4,594
to 97, 97, and 5,074. No override is used. The node adds no specialized
matcher path, runtime allocation, generated-code entry point, or built-in code
range. The runtime ABI moves to `oseo-runtime-m5-74` as the admitted semantic
checkpoint, without changing a C layout or runtime component.

All 625 paths under *test/built-ins/RegExp/CharacterClassEscapes/* and
*test/built-ins/RegExp/property-escapes/* are reviewed. The 142 parse-negative
paths are expected negatives; the remaining 483 retain explicit boundaries
for the RegExp intrinsic and execution, class set notation, or other later
nodes. The combined manifest moves from 11,991 to 12,616 paths, keeps 8,918
passes, moves from 1,364 to 1,506 expected negatives, and moves from 1,709 to
2,192 unsupported profile features, with no semantic, harness, or
infrastructure failures. The suite revision, 41,091-path applicable inventory,
ADR 0013 vocabulary, inventory policy, and zero-override policy are unchanged.

Implemented M5b node `regexp-intrinsic` materializes the callable and
constructible `%RegExp%` intrinsic and `%RegExp.prototype%`. Calling it uses
the intrinsic as `newTarget` and preserves the same-constructor identity case.
Construction retains the actual `newTarget`; `IsRegExp` observes
`Symbol.match` before the native brand, and a regexp-like object supplies
ordered `source` and optional `flags` property reads. Allocation reads the
selected constructor's `prototype` before pattern and flags conversion, then
creates one independently mutable, writable, non-enumerable, and
non-configurable `lastIndex` data property initialized to zero.

Dynamic initialization validates the admitted generic-matcher grammar and
stores its source, decoded flags, capture count, and instruction budget in a
separate immutable collector-owned descriptor. Invalid dynamic patterns and
flags throw a catchable `SyntaxError`. Unicode property escapes, Unicode set
and string syntax, modifier groups, prototype execution and accessors, symbol
methods, String integration, and literal lowering retain explicit boundaries
owned by later graph nodes. The collector traces each RegExp through its
matcher descriptor to the converted source and flags. A bounded
allocation-attempt sweep fails every allocation in intrinsic publication,
successful construction, and catchable-SyntaxError construction, collects,
and retries each attempt to prove cleanup, rooting, stable identity, and
complete publication.

Fixed and generated differential evidence covers Node.js, Deno, both
specialization policies, forced collection at every safepoint, false hints,
guard hits and misses, subclass construction, conversion order, and mutable
`lastIndex`. The generated domains use seeds `0x60004f00` and `0x60004f01` in
the reserved block through `0x60004fff`. The runtime ABI moves to
`oseo-runtime-m5-75`, and built-in code range index 16 is allocated without a
gap. No generated-code entry point, inventory policy, classification
vocabulary, manifest schema, or override changes.

All 492 paths under the node's reviewed RegExp roots are included: 111 pass
and 381 retain explicit downstream boundaries. Sixty-nine already-reviewed
Array, Object, and Symbol paths outside those roots move from unsupported to
pass because they now observe the real RegExp object. The combined manifest
reaches 13,108 paths, 9,098 passes, 1,506 expected negatives, and 2,504
unsupported profile features, with no semantic, harness, or infrastructure
failures. The property ratchet moves from 97 to 99 domains, from 97 to 99
seeds, and from 5,074 to 5,088 ordinary cases. The suite revision and
41,091-path applicable inventory remain unchanged.

Implemented M5b node `array-prototype-sort` gives the realm-owned
`%Array.prototype%` ordinary `sort` and `toSorted` functions and retires the
`sort` entry from the unadmitted boundary table. Both reject a non-callable
comparator before converting the receiver, so no `length` read is observable
when the comparator is invalid. `toSorted` then reads LengthOfArrayLike and
allocates its plain Array, rejecting a length above `2**32 - 1` with a
catchable `RangeError`, before any element is read.

SortIndexedProperties reads every index into one collected list before the
first comparison runs. `sort` checks HasProperty first, so a hole is skipped
and collapses behind the sorted elements; `toSorted` reads through holes, so a
hole becomes an undefined element of the copy. CompareArrayElements orders an
undefined element after every defined one without reaching the comparator,
converts a supplied comparator's result with `ToNumber` and reads `NaN` as
`+0`, and otherwise compares the `ToString` results in code-unit order. One
bottom-up merge over the collected list supplies the required stability and
stops at the first abrupt comparison without performing another. `sort`
publishes with Set and DeletePropertyOrThrow over the converted receiver,
while `toSorted` fills the Array it already allocated, so neither method reads
`constructor` or `Symbol.species`. The collected list and its merge scratch
buffer root their own storage, so element identity survives a collection
inside any comparator, getter, or setter. The implementation stays in
*runtime\_array.c* because these paths share property primitives, array-like
length reading, and collector roots with the Array intrinsic.

Fixed native and generated differential evidence at seed `0x60005100` covers
both specialization policies, forced collection at every safepoint, sparse,
generic, inherited, and frozen receivers, undefined and hole ordering,
comparator coercion and abrupt completion order, stability across both the
in-place and copy-back merge passes, mutation observed through accessors
during collection and write-back, the plain-Array copy, false hints, a
deliberate shape-guard miss, and generic fallback. Of the 75 paths in the node
inventory, 74 are reviewed: 55 pass and 19 retain explicit prerequisite
boundaries for the unadmitted `Boolean` and `isNaN` globals, regular
expression evaluation, `Reflect.construct`, resizable-buffer TypedArray
views, and the `Array.prototype` `pop` and `reduce` methods later nodes own.
The one omitted path builds a 2,048-element array literal, which exceeds the
documented 32,768 root-slot native frame budget before any sorting runs; the
fixed suite replaces its stability observation with an eleven-element ordering
over duplicated keys. No already-reviewed path outside the roots changes
classification. The manifest moves from 13,108 to 13,182 paths, from 9,098 to
9,153 passes, keeps 1,506 expected negatives, and moves from 2,504 to 2,523
unsupported profile features, with no semantic, harness, or infrastructure
failures. `stable-array-sort` and `change-array-by-copy` join the reviewed
supported-feature list because this node admits both, and no already-reviewed
path carries either flag. The property ratchet moves from 99 to 100 domains
and seeds and from 5,088 to 5,098 ordinary cases. The admitted runtime
checkpoint moves the runtime ABI to `oseo-runtime-m5-76` and allocates two
code IDs inside the existing Array range without adding a generated-code entry
point or changing the graph's orchestration state. The suite revision,
41,091-path applicable inventory, ADR 0013 vocabulary, inventory policy, and
zero-override policy are unchanged.

Implemented M5b node `string-prototype-replace` gives the materialized
`%String.prototype%` ordinary `replace` and `replaceAll` functions and
removes `replace` from the unadmitted-method placeholder list, which never
covered `replaceAll` because that name had no own property at all. Both
methods observe their search operand only when it is an Object: an Object
receives `Symbol.replace` through GetMethod, and a callable method is
called with the original receiver and the original replacer as exactly two
arguments. `replaceAll` first performs `IsRegExp` on an Object operand,
requires an object-coercible `flags` value containing `g` for a true
`@@match` result, and only then looks the method up. A primitive operand,
a missing operand, and a nullish `@@replace` method all take the String
fallback. This node also gives `%RegExp.prototype%` the deferred
`@@replace` placeholder that already stood for the four other String
protocol symbols, so a RegExp operand reaches the owned
`regexp-symbol-methods` boundary through GetMethod instead of falling
through to the code-unit search admitted here.

The fallback converts the receiver, then the search value, then a
non-callable replacer, in that order, and searches UTF-16 code units.
`replace` substitutes the first occurrence; `replaceAll` collects
nonoverlapping occurrences, advancing by one code unit when the search
string is empty, so an empty search inserts the replacement before every
code unit and once after the last. A callable replacer is never converted
and receives the matched text, its position, and the whole subject, with
its result converted through `ToString`. A String replacer goes through
GetSubstitution, where `$$`, `` $` ``, `$&`, and `$'` substitute. Because
both callers supply an empty capture list and an undefined named-capture
object, `$1` through `$99` and `$<name>` have no referent and copy their
reference text unchanged; the RegExp nodes that introduce captures extend
that operation rather than replacing it.

Restricting the operand observation to Objects is the current
specification, and the pinned test262 revision asserts it directly in
*cstm-replace-on-number-primitive.js*,
*cstm-replaceall-on-number-primitive.js*, and their BigInt counterparts,
all four of which pass now that `bigint-intrinsic` has landed. The pinned
Node.js host still performs the older unconditional lookup while the pinned
Deno host does not, so the two reference hosts disagree; that observation
stays with the reviewed test262 cases instead of the fixed differential
fixture, which requires both hosts to agree. The same choice already
governs `string-prototype-match-and-split`.

Fixed native and generated differential evidence at seeds `0x60005200` and
`0x60005201` covers primitive, wrapper, and generic receivers, both symbol
dispatches, a null and a non-callable method, an abrupt method getter,
every GetSubstitution reference form against subjects that themselves
contain `$`, functional replacers with their arguments and abrupt results,
empty searches and empty subjects, overlapping candidates, lone
surrogates, `replaceAll`'s IsRegExp and `flags` observations including
their abrupt forms, `replace`'s absence of those observations, nullish and
Symbol receivers, both specialization policies, forced collection at every
safepoint, false hints, deliberate shape-guard misses, and generic
fallback.

Of the 100 paths under the node's two inventory roots, all are reviewed:
54 pass and 46 retain explicit prerequisite boundaries. Thirty-eight of
those build a regular expression, four need the unadmitted `Boolean`
wrapper receiver, two need the `Function` constructor, and two need
`Reflect.construct`. The reviewed RegExp rows keep the `functions` and
`object-properties` tags they earn rather than gaining
`regular-expressions`, which stays with the deferred cross-family
retagging that `regexp-symbol-methods` owns. No previously reviewed path
changes classification, because no reviewed case outside those roots calls
either method or declares the `String.prototype.replaceAll` feature this
change admits. The manifest moves from 13,453 to 13,553 paths and from
9,311 to 9,365 passes, keeps 1,506 expected negatives, and moves from
2,636 to 2,682 unsupported profile features, with no semantic, harness, or
infrastructure failures. The admitted runtime checkpoint moves the runtime
ABI to `oseo-runtime-m5-78` without adding a generated-code entry point or
changing the graph's orchestration state. The String built-in code range
gains two IDs for the two methods, and the RegExp range gains a twentieth
for the deferred `[Symbol.replace]` placeholder.

Implemented M5b node `generic-string-coercion` routes `ToString` for an
arbitrary object through the materialized `%Object.prototype.toString%`,
`@@toPrimitive`, and `@@toStringTag`, and retires the two private text
substitutes the conversion still selected by intrinsic prototype identity.
The first was a virtual receiver-sensitive tag text used whenever the
prototype chain reached a realm-owned prototype but the lookup found no
`toString`; the second was a
`Function and promise text conversion is unsupported` diagnostic, with a purely
numeric shortcut to `NaN`, used whenever the found `toString` was
`%Object.prototype.toString%` and the nearest intrinsic prototype was
`%Function.prototype%` or `%Promise.prototype%`. Both predate
`object-prototype` and `well-known-symbols`, which together made the real
method and the real tag reachable.

OrdinaryToPrimitive now reads `valueOf` and `toString` with the ordinary
property lookup and calls whichever function it finds. A promise therefore
renders as `[object Promise]` through its prototype's `@@toStringTag`
instead of reporting the retired diagnostic, and its numeric conversion
materializes that text before `ToNumber` rather than shortcutting, so a
`@@toStringTag` getter on the receiver is observed. An object inheriting
`%Function.prototype.toString%` without being callable reaches that
method's own `TypeError` instead of a reconstructed one. A replaced
`%Object.prototype.toString%` was already called through the ordinary
lookup; what is newly observable is deleting it, or deleting
`%Object.prototype.valueOf%` alongside it, because the deleted pair now
throws the specified `TypeError` where the virtual tag text used to answer.

Array text keeps the deferred conversion selected by intrinsic identity.
The Array prototype nodes own it because it honors a user `join` and shares
the conversion's cycle stack, and this node changes neither. Measuring that
path against the reference hosts while retiring the substitutes above found
one divergence it still owns, unchanged by this node and reproducible on the
parent commit: a cyclic array-like inheriting `%Array.prototype%` observes
its `length` accessor once rather than twice, because the deferred path
detects the cycle before reading the nested receiver's length. Two receivers
still report an owned prerequisite boundary from inside
`%Object.prototype.toString%` rather than from the conversion:
`function-intrinsic-chains` owns generator function and generator object
reflection, and `boolean-intrinsic` and `symbol-intrinsic` own the
placeholder wrapper prototype methods a `Boolean` or `Symbol` wrapper
reaches.

The reviewed *doneprintHandle.js* harness stops printing the bare failure
marker and composes the upstream failure detail, because an ordinary object
failure value now renders. It guards that composition and falls back to the
bare marker for a Symbol and for any object whose conversion completes
abruptly, so a conversion cannot replace a case's failure report. The
*asyncHelpers.js* `assert.throwsAsync` adaptation keeps comparing
constructor identity without composing a message from the observed value;
that is now a robustness choice against a missing or exotic `constructor`
rather than a coercion boundary.

Fixed native and generated differential evidence at seed `0x60005300`
covers `@@toPrimitive` dispatch with each hint string and its non-callable,
object-result, and abrupt rejections, an explicit null method, hint order
and fallthrough for `valueOf` and `toString`, an object with neither
convertible method, a null-prototype receiver, `@@toStringTag` in own,
inherited, non-string, getter, abrupt, and builtin-shadowing forms, every
builtinTag receiver the profile admits, deleted and replaced default
methods, `Object.prototype.toLocaleString` over the same receivers, both
specialization policies, false hints, deliberate shape-guard misses,
generic fallback, and collection forced at every safepoint.

The node declares no test262 inventory root. Every applicable upstream path
its behavior reaches is already reviewed: all 41 under
*test/built-ins/Object/prototype/toString/* by `object-prototype`, and the
two each under *test/built-ins/Symbol/toPrimitive/* and
*test/built-ins/Symbol/toStringTag/* by `well-known-symbols`. No previously
reviewed path changes classification, and the manifest keeps 13,553 paths
with 9,365 passes, 1,506 expected negatives, and 2,682 unsupported profile
features. Growing the reviewed subset inside the families this admits stays
with the `reviewed-subset-growth` backlog lane. The admitted runtime
checkpoint moves the runtime ABI to `oseo-runtime-m5-79` without adding a
generated-code entry point, a built-in code ID, or a translation unit, and
without changing the graph's orchestration state.

Implemented M5b node `object-create` completes `Object.create` over the
ObjectDefineProperties body the collection checkpoint already landed. The
prototype check precedes every read of the properties argument, so a
prototype that is neither an object nor null throws before a poisoned
properties getter can run, an undefined properties argument returns the
fresh null- or object-prototype object directly, and any other properties
value flows through the one collection body `Object.defineProperties`
owns, so conversion, ordering, and abrupt completions behave identically
over the freshly created target. An abrupt collection discards the fresh
object, and definitions on it cannot fail. The M3 descriptor-map
rejection and its `object-create-descriptor-map` dependency observation
retire, which also lets `Object.create(...values)` spread calls reach the
admitted contract. Fixed native and generated differential evidence at
seed `0x60005400` covers null, object, and invalid prototypes, entries,
undefined, and null properties arguments, module namespace properties and
prototype arguments, both specialization policies, forced collection,
false hints, deliberate shape-guard misses, and generic fallback. All 320
paths under the node's inventory root are reviewed: 267 pass and 53
retain explicit prerequisite boundaries for the unadmitted `Boolean`,
`Date`, `JSON`, and `Math` globals, the deferred
`Object.getOwnPropertyNames` static, and `Reflect.construct`. The
previously reviewed for-in shadowing-order case moves from unsupported to
pass. The manifest moves to 13,872 paths with 9,632 passes, 1,506
expected negatives, and 2,734 unsupported profile features. The admitted
checkpoint moves the runtime ABI to `oseo-runtime-m5-80` without changing
the graph's orchestration state.

Implemented M5b node `math-namespace` materializes the `Math` namespace
object. `Math` is an ordinary object whose `[[Prototype]]` is the realm's
`%Object.prototype%`, and the global object binds it as a writable,
non-enumerable, configurable property, so the compiler treats it as a
property-owned replaceable intrinsic exactly as it treats `Number` and
`String`. It is not a function: it has neither `[[Call]]` nor
`[[Construct]]`, and its `Symbol.toStringTag` is the non-writable,
non-enumerable, configurable string `"Math"`. None of its function
properties is a constructor either, so a `new` on one throws a `TypeError`
before any argument is converted.

The eight value properties of 21.3.1 are non-writable, non-enumerable, and
non-configurable, and the thirty-six function properties of 21.3.2 are
writable, non-enumerable, configurable built-in functions with their
specified names and lengths. `Math.sumPrecise` belongs to a later edition
than the one ADR 0013 pins and is not added; the pinned applicable
inventory already excludes its ten upstream paths.

Every function converts its arguments with `ToNumber` in argument order and
propagates the first abrupt conversion without converting the arguments
after it. `Math.max`, `Math.min`, and `Math.hypot` convert their whole
argument list before comparing any of it. The exactly determined
operations produce exactly the specified Number, including `Math.round`'s
tie toward positive infinity and its `-0` window, the signed zeroes
`ceil`, `floor`, `trunc`, `abs`, `sign`, `sqrt`, `cbrt`, `min`, `max`,
`fround`, and `f16round` preserve, the `NaN` and infinity precedence in
`max`, `min`, and `hypot`, Number::exponentiate for `pow`, the
ties-to-even binary32 and binary16 rounding `fround` and `f16round`
perform over exact binary64 scaling of the operand, and the `ToUint32`
readings `clz32` and `imul` report.

The remaining operations are the ones ECMA-262 marks
implementation-approximated. This profile commits to their special values,
argument conversion, and sign behavior rather than to a digit-exact
result, and on the supported native targets they are the host C library's
correspondingly named operations. Those agree with the reference hosts to
within one unit in the last place, so the differential fixtures assert the
exactly specified cases directly and the approximated ones through bounded
identities; recording a permitted last-place difference as a semantic
requirement would make the reviewed evidence depend on a specific libm.

`Math.random` draws from a realm-owned xorshift128+ generator whose two
state words the realm mixes from its own initialization ordinal, meaning
the number of realms the process had already initialized. ECMA-262 leaves
the strategy to the implementation but requires the `Math.random` of one
realm to produce a sequence distinct from every other realm's, and this
runtime keeps every other observable schedule reproducible, including its
logical timer clock, so realm N of a run seeds from ordinal N: a host that
initializes its realms in one order draws the same pairwise distinct
sequences on every run and every supported target rather than seeding from
host entropy. The ordinal counter is atomic, so a host that initialized two
realms on separate threads would still give each its own ordinal without a
data race, but atomicity does not order the two, so that host would keep
distinctness and give up the fixed assignment of ordinal to realm. No
current host initializes realms concurrently. Introducing an entropy source
is a host capability decision no current node owns, and nothing in the
pinned suite observes the difference.

The runtime gains one component, *runtime\_math.c*, and one built-in code
range whose thirty-six IDs count down from the range last in the same
order the namespace creates its function properties, so the dispatch reads
an index rather than a table. `ToUint32` and Number::exponentiate move
from file-local helpers in *runtime\_primitive.c* to two internal helpers
that the `**` operator and `Math` now share, which keeps the two cases
where C `pow` disagrees with the specification decided in one place.

The reviewed *nans.js* harness include becomes available with this node,
because its only unadmitted dependency was `Math.pow`. Removing it from
the unavailable-include set promotes the two reviewed
_Object/internals/DefineOwnProperty/nan-equivalence-\*.js_ cases.

Fixed native and generated differential evidence at property seed
`0x60005600` covers the namespace identity, prototype, and tag, every
descriptor class, every function's name and length, the specified signed
zeroes, infinities, and `NaN` results, exact square roots, powers,
logarithms of powers of two, Pythagorean `hypot` scales, binary32 and
binary16 rounding at and past the format boundaries, `ToUint32` wrapping,
argument conversion order, abrupt conversion, `Symbol` operands, bounded
approximated identities, the pseudorandom range, both specialization
policies, collection forced at every safepoint, false hints, deliberate
shape-guard misses, generic fallback, and the global-object write, delete,
restore, assignment-target, and strict missing-property sequences the
replaceable binding admits. One native C fixture initializes three realms
in a single process and observes that their `Math.random` sequences differ
pairwise while every draw stays inside `[0, 1)`, which the fixed seeding
this node replaced could not satisfy; the fixture prints those draws and
its driver runs the executable twice on the matching native target to
observe the two runs agreeing.

Of the 317 paths under the node's inventory root, 316 are reviewed: 280
pass and 36 retain the explicit `Reflect.construct` prerequisite their
*isConstructor.js* include needs. The remaining path,
*test/built-ins/Math/sqrt/results.js*, stays outside the reviewed subset:
its thousand-entry nested array literal exceeds the runtime's reviewed
active frame-slot budget, an existing resource boundary this node does not
own. One hundred and five previously reviewed paths outside the root change
classification from `unsupported-profile-feature` to `pass`, one hundred
and three because they read `Math` while probing an unrelated contract and
two because the *nans.js* include became available. Eleven of the hundred
and three are the _Object/create/15.2.3.5-4-\*.js_ cases that pass the
`Math` object itself as a `Properties` argument, which `object-create`
reviewed as unsupported while `Math` was absent, and five are
_RegExp.prototype.exec_ and _RegExp.prototype.test_ cases that read `Math`
for a match subject or a `lastIndex` value, which `regexp-literal-aot`
reviewed as unsupported for the same reason. No previously reviewed path
loses a pass. The manifest moves from 13,872 to 14,188 paths and from
10,013 to 10,398 passes, keeps 1,506 expected negatives, and moves from
2,353 to 2,284 unsupported profile features, with no semantic, harness, or
infrastructure failures. The admitted runtime checkpoint moves the runtime
ABI to `oseo-runtime-m5-82` without adding a generated-code entry point or
changing the graph's orchestration state.

Implemented M5b node `array-prototype-reduction` gives the realm-owned
`%Array.prototype%` ordinary `reduce` and `reduceRight` functions and
retires both entries from the unadmitted boundary table. Each method
converts its receiver with `ToObject` and reads LengthOfArrayLike before
validating the callback, so a `length` read is observable even when the
callback is not callable, and a non-callable callback then throws a
`TypeError`, as does an empty traversal without an initial value.

One accumulator loop serves both methods: `reduce` visits ascending
indices from zero and `reduceRight` descending indices from the snapshot
length minus one, each index passing HasProperty before Get, so holes are
skipped and inherited entries participate while indices at or above the
snapshot length stay unvisited. Initial-value presence follows the
argument count, so an explicit `undefined` initial value seeds the
accumulator; otherwise the first present element in traversal order seeds
it without a callback invocation, and a traversal that ends without one
throws a `TypeError`. The callback receives the accumulator, element,
index, and converted receiver with an undefined `this` value, and its
abrupt completion or an abrupt `length`, element, or coercion read stops
the loop at that step. Neither method allocates a result array, so no
`constructor` or `Symbol.species` read is reachable. The implementation
stays in *runtime\_array.c* because both methods share property
primitives, array-like length reading, and collector roots with the
Array intrinsic, and the receiver, callback, and accumulator stay rooted
across user code, so element and accumulator identity survive a
collection inside any callback or accessor.

Fixed native and generated differential evidence at seed `0x60005700`
covers both specialization policies, forced collection at every
safepoint, sparse, generic, inherited, primitive, and frozen receivers,
both traversal orders, accumulator seeding, initial-value presence by
argument count, the empty-traversal `TypeError`, callback argument order
and receiver identity, length coercion and clamping, mutation during the
snapshot-length loop, abrupt completion at each observable step, false
hints, a deliberate shape-guard miss, and generic fallback. All 520 paths
under the node's two inventory roots are reviewed: 494 pass and 26 retain
explicit prerequisite boundaries. Fourteen need the unadmitted `Boolean`,
`Date`, or `JSON` globals, two need `Reflect.construct`, two need
TypedArray receivers, six need resizable-buffer harness support, and two
expect the dynamic `ReferenceError` an unreferenced callback binding
requires, which the profile reports as a source-located diagnostic
instead. Three sort stability paths outside the roots change
classification from `unsupported-profile-feature` to `pass` because their
final observation reduces the sorted result, which this node admits. The
manifest moves from 14,188 to 14,708 paths, from 10,398 to 10,895 passes,
keeps 1,506 expected negatives, and moves from 2,284 to 2,307 unsupported
profile features, with no semantic, harness, or infrastructure failures.
The property ratchet moves from 112 to 113 domains and seeds and from
5,204 to 5,214 ordinary cases. The admitted runtime checkpoint moves the
runtime ABI to `oseo-runtime-m5-83` and allocates two code IDs inside the
existing Array range without adding a generated-code entry point or
changing the graph's orchestration state. The suite revision, 41,091-path
applicable inventory, ADR 0013 vocabulary, inventory policy, and
zero-override policy are unchanged.

Implemented M5b node `string-prototype-case` adds `toLowerCase`,
`toUpperCase`, both locale case forms, `trim`, `trimStart`, `trimEnd`,
`normalize`, and `localeCompare` to the realm-owned `%String.prototype%`.
Every method applies `RequireObjectCoercible` and the shared `ToString`, with
receiver conversion preceding the normalization form or comparison operand.
The case methods use the full locale-insensitive Unicode 17.0.0 mappings,
including expansions, supplementary code points, unpaired-surrogate
preservation, and contextual final sigma over the pinned `Cased` and
`Case_Ignorable` properties. The locale forms deliberately use that same
host-independent default mapping.

Trimming uses the exact ECMAScript WhiteSpace and LineTerminator set.
Normalization admits `NFC`, `NFD`, `NFKC`, and `NFKD`, including recursive
decomposition, canonical combining-class order, composition exclusions, and
algorithmic Hangul handling, with `NFC` as the default and `RangeError` for
another converted form. `localeCompare` normalizes both operands to `NFD`
before a deterministic UTF-16 code-unit comparison, so canonically equivalent
strings compare equal without importing host locale state.

The pinned Unicode generator emits one compact C runtime header beside its
existing TypeScript module and verifies both outputs from the same reviewed
inputs. The runtime package ships the Unicode permission notice. Seven new
IDs in the existing String range dispatch the nine function objects, because
the ordinary and locale case forms share their respective conversion bodies.
No generated-code entry point or public runtime layout changes.

Fixed and generated native differential evidence at seed `0x60005800` covers
case mappings across the full generated Unicode domain, trim inclusions and
exclusions, all four normalization forms, canonical comparison, generic
receivers, conversion order, abrupt completion, method metadata, both
specialization policies, false hints, deliberate shape-guard misses, generic
fallback, collection at every safepoint, and the AArch64 Linux cross-link.
All 312 paths under the nine inventory roots are reviewed: 290 pass and 22
retain explicit prerequisite boundaries. Nine need `Reflect.construct` for
their *isConstructor.js* include, nine need the unadmitted Boolean wrapper
intrinsic, and four need dynamic `eval`. Three Number conversion paths outside
the roots move from `unsupported-profile-feature` to `pass` because admitting
the `u180e` feature exposes their already-correct conversion result. The
manifest moves from 14,708 to 15,020 paths and from 10,895 to 11,188 passes,
keeps 1,506 expected negatives, and moves from 2,307 to 2,326 unsupported
profile features, with no failures. The checkpoint moves the runtime ABI to
`oseo-runtime-m5-84` without changing the graph's orchestration state.

Implemented M5b node `array-prototype-index-search` gives the realm-owned
`%Array.prototype%` ordinary `at`, `includes`, `indexOf`, and `lastIndexOf`
functions and retires the two deferred search entries from the unadmitted
boundary table. Each method converts its receiver and snapshots
LengthOfArrayLike before its relative-index conversion. The three search
methods skip that conversion for an empty receiver, while `at` still performs
it. Positive indices count from zero, negative indices add the snapshot
length, and omitted `lastIndexOf` starts at the final index while explicit
`undefined` converts to zero.

`indexOf` and `lastIndexOf` traverse present properties through HasProperty
then Get and use strict equality, so they skip holes and do not find `NaN`.
`includes` and `at` use Get directly, so holes read as `undefined`, and
`includes` uses SameValueZero so it finds `NaN`; `at` reads one relative index
or returns `undefined` out of range. All four methods are generic, include
inherited values, and observe mutation live below the snapshot length. They
stay in *runtime\_array.c* because they share the Array intrinsic's property
primitives, length conversion, and collector roots, and the receiver and
searched value remain rooted across every user-code boundary.

Fixed native and generated differential evidence at seed `0x60005900` covers
a 12-case ordinary budget over sparse Arrays and ordinary array-like objects
with zero through seven entries, stable and fresh object identities, `NaN`,
signed zero, strings, undefined, bounded numbers, finite and infinite relative
indices, and an independent strict-equality/SameValueZero oracle. It also
covers metadata, inherited and primitive receivers, observable ordering, live
mutation, abrupt completion, both specialization policies, collection forced
at every safepoint, false hints, deliberate shape-guard misses, and generic
fallback. All 442 paths under the four inventory roots are reviewed: 414 pass
and 28 retain explicit prerequisite boundaries. Twelve require the resizable
ArrayBuffer harness, three require `Proxy`, three require `Reflect.construct`,
eight require the unadmitted Boolean, Date, or JSON intrinsics, one requires
`isNaN`, and one requires dynamic `eval`. Two String-prototype index-search
paths outside the roots move from `unsupported-profile-feature` to `pass`
because the Array search methods satisfy their observations. The manifest
moves from 15,020 to 15,462 paths and from 11,188 to 11,604 passes, keeps 1,506
expected negatives, and moves from 2,326 to 2,352 unsupported profile
features, with no failures. The property ratchet moves from 114 to 115
domains and seeds and from 5,222 to 5,234 ordinary cases. The admitted runtime
checkpoint moves the ABI to `oseo-runtime-m5-85`, allocates four code IDs
inside the existing Array range, and adds no generated-code entry point or
graph-state change. The reviewed test262 revision, 41,091-path applicable
inventory, ADR 0013 vocabulary, inventory policy, and zero-override policy
are unchanged.


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
