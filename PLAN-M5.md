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
honest unsupported classifications. The current reviewed manifest records 1,511
passes, 988 expected negatives, and 381 unsupported profile features with no
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

`%GeneratorPrototype%.throw`, asynchronous generators, and generator
method definitions remain rejected with source-located diagnostics. No throw
resumption can reach a body while `%GeneratorPrototype%.throw` is
unimplemented, so the `throw` branch of `yield*` is unreachable and
unimplemented. `%GeneratorFunction%` and `%GeneratorFunction.prototype%` stay
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
The generated property suite uses seed `0x5eed0016` across zero to four
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
property suite uses seed `0x5eed0017` across class declarations, named
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
unit's boundaries. Static initialization blocks and `export default class`
remain rejected with source-located diagnostics.
Asynchronous class methods are admitted, because they share the object literal
method path exactly; generator and asynchronous generator methods stay rejected
with the same diagnostic object literals already use. The manifest moves to 812
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
against the non-writable, non-configurable `prototype` property. Static
initialization blocks and private static methods and accessors stay rejected
with the class element diagnostic they already had. Fixed native fixtures
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
chains together: the constructor's [[Prototype]] becomes the parent
constructor and the class `prototype` object's [[Prototype]] becomes
`Get(parent, "prototype")`. Static members therefore resolve through the
constructor chain and instance members through the prototype chain, and both
objects stay out of dictionary mode because a class definition allocates them
itself. A derived constructor owns a `this` binding rather than reading its
receiver, as a fresh uninitialized cell per invocation, so reading `this`
before `super()` throws a `ReferenceError` through the temporal-dead-zone
machinery lexical declarations already use, and every arrow function nested in
the constructor shares that cell. `super()` reads the running constructor's
own [[Prototype]], rejects a non-constructor with a `TypeError`, constructs it
against the receiver the `new` expression allocated from `new.target`'s
prototype, and binds the result; a second `super()` throws a `ReferenceError`,
and a base constructor that returns its own object replaces the allocated
receiver. An error constructor reached through `super()` takes its instance
prototype from the same new target rather than from its own `prototype`, so
`class AppError extends Error {}` produces instances whose prototype is
`AppError.prototype`, while a direct `new Error` supplies itself as the new
target and is unchanged. The addition specialization declines a derived
constructor, because its fast path would leave the block before the
`derived-return` operation the `this` binding routes every `return` through,
so a parameter hint cannot change what a derived constructor returns. Because
`super()` reuses the receiver the `new` expression allocated instead of
performing a fresh `Construct` per call, a second `super()` runs the parent
against that same receiver rather than a new one. When the parent declares no
private element, the required `ReferenceError` still follows and the parent
still runs exactly twice, so the difference reaches only a parent that
publishes or mutates its receiver during a call that is already doomed. When
the parent declares a private element, reinstalling it on a receiver that
already carries it throws a `TypeError` from InitializeInstanceElements before
the parent body runs again, so that case reports the wrong error type and runs
the parent once. Closing both needs a runtime `Construct` path that allocates
at the base-constructor boundary, and the language profile records it as a
known gap. Every `return` of a derived constructor leaves
through that binding,
so an object stands as written, `undefined` yields the bound `this`, and any
other value is a `TypeError`; MIR rewrites the terminators after the body is
built, so a `return` inside `try` still runs a `finally` that calls `super()`.
A body without a `constructor` gets the implicit
`constructor(...args) { super(...args); }` with a synthetic rest parameter
name and a `length` of zero. `new.target` is admitted as its own expression
over the construction target the call ABI already carries: it is the
constructed class through every `super()` hop and `undefined` for an ordinary
call, a method call, a generator body, and an asynchronous function.
`super()` and `new.target` inside an arrow function stay rejected with a
source-located diagnostic, because an arrow takes both from the function
enclosing it and this profile captures neither
lexically yet. Fixed native fixtures cover two-level and three-level chains,
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
`new.target` early error the added feature tag now reaches, and seventeen new
unsupported cases record `super()` from an arrow function, `super.property`,
and the `Reflect`, tagged template, `Function.prototype.bind`, typed-array,
and `Object` intrinsics other inheritance cases need. The two
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
[[Prototype]] of the home object its running function carries, so an instance
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
object's [[Prototype]] after that key, so a key expression that replaces the
prototype is observed by the very reference it precedes. A reference stays
rejected with a source-located diagnostic in a class body without `extends`
and in an object literal method, because this runtime has no
`Object.prototype` object for that lookup to reach, inside an arrow function,
which owns no home object, inside an asynchronous class element, whose body
runs in a synthesized function that carries none, and as the operand of
`delete`, a destructuring assignment target, or a `for` head. Fixed native
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
`super`, on the prototype and on the constructor. Eighteen reviewed test262
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
constructor in class-body order, which is ECMA-262's [[Fields]]. A second
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
[[ClassFieldInitializerName]] without a second evaluation. The initializer
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
through the same name. Deliberate boundaries: a static private method or
accessor, `#name in object`, a private reference based on anything other
than `this`, optional `?.#name` access, and a private reference used as a
destructuring or `for-of` assignment target stay rejected with source-located
diagnostics, and `delete this.#name` is reported as an early error. Fixed
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
all. Deliberate boundaries: a static private method or accessor and a static
field reached as `C.#name` rather than
through `this` stay rejected with source-located diagnostics, and a static
field named `constructor` or `prototype` remains the early error it is.
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
cases record the `C.#name` boundary this unit keeps. The reviewed subset
gains the `class-static-fields-public` and `class-static-fields-private`
feature tags; the remaining cases those tags reach need `String`, further
`Object` members, `eval`, `Proxy`, `Function`, static private methods, or
generator and asynchronous methods, and stay outside the reviewed subset
until the units that own them land. The manifest moves to 1203 passes, 871
expected negatives, and 365 unsupported profile features with no semantic or
harness failures.

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
inside the admitted syntax, *static-init-sequence.js*, needs
`Array.prototype.push` and stays outside the reviewed subset until the unit
that owns it lands, with the same interleaving covered by a native fixture
meanwhile. The manifest moves to 1230 passes, 898 expected negatives, and 373
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

A step suspends by draining the scheduler rather than by returning to the
caller, because the frontend splits an `await` expression into continuations
and a loop has no such split. Interleaving with jobs already queued is
preserved, but the enclosing asynchronous function does not return to its
caller at a step, and a step whose promise can never settle reports
`OSEO3001` instead of leaving the function pending forever. That is the one
deviation this unit accepts; the profile's gap entry owns it, and closing it
needs the same suspension record asynchronous generators need, so the two
land together.

Native differential fixtures cover the synchronous fallback, generator and
user iterables, `Symbol.asyncIterator` preference over `Symbol.iterator`,
promised and direct step results, `done` and `value` accessor order,
timer-driven steps, the turns a wrapped step and a wrapped close each spend
against previously queued reactions,
every head form, closures over per-iteration cells, the
head's dead zone, every transfer, absent, promised, and throwing `return`
methods, nested and `finally`-wrapped loops, and every catchable `TypeError`
the protocol defines. A generated property with seed `0x5eed0011` draws
asynchronous and synchronous iterator kinds, head forms, transfer positions,
and close modes under both specialization policies and forced collection.
Asynchronous generators stay rejected, so the asynchronous generator cases
the `async-iteration` tag reaches stay outside the reviewed subset.
Two hundred eighty-one reviewed test262 cases newly pass, ninety new expected
negatives record the head's early errors, and eight new unsupported cases
record that asynchronous generator boundary. The reviewed subset gains the
`async-iteration` and `Symbol.asyncIterator` feature tags, and the manifest
moves to 1511 passes, 988 expected negatives, and 381 unsupported profile
features with no semantic or harness failures.

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
on the taken write path. Plain `=` assignment to a computed member likewise
retains the raw key and converts it only after the right operand, as `PutValue`
specifies. Logical assignments lower through explicit branches,
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
