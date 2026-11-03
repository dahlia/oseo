ADR 0034: Legacy function caller contract
=========================================

Status
------

Accepted by the maintainer on 2026-11-03 for the `legacy-caller` unit of
[*PLAN-LANGUAGE.md*](../../PLAN-LANGUAGE.md). It supersedes
[ADR 0028](./0028-legacy-function-caller-boundary.md): the optional legacy
`caller` extension enters the profile, and ADR 0028's M5 exclusion ends when
the unit lands its reviewed rows.


Context
-------

ADR 0028 kept the legacy `caller` extension out of the M5 profile and excluded
the 23 test262 paths with `features: [caller]`. It deferred the extension
because a useful contract has to settle caller identity, inactive and top-level
results, strict callers, recursion, exception unwinding, forwarding through
`call`, `apply`, and `bind`, realms, descriptors, and the excluded function
kinds. The maintainer approved the extension on 2026-11-02 as part of the
post-M5 language track.

The edition defines almost none of this. Clause 17.1 lets an implementation
add an own `caller` property to a non-strict function, forbids one on built-in,
strict, arrow, method, generator, async, and class functions, and forbids the
value from being a strict function. It says nothing about `arguments` as a
function property, about which caller is reported, or about what an inactive
function reports. Without an own property, a read reaches the
%ThrowTypeError% accessor that AddRestrictedFunctionProperties installs on
%Function.prototype%, and throws.

Packages that use the extension were written against the engines that ship it.
Node.js 24.21.0, one of the two reference hosts, ships it and is the reference
wherever the edition leaves a choice. The other reference host, Deno 2.9.7,
runs V8 15.0, which no longer gives non-strict functions own `caller` or
`arguments` properties. Its %Function.prototype% getters answer for a
non-strict function instead, with the same caller and arguments values as
Node.js, and throw a `TypeError` for a strict one. Deno is therefore a second
reference for the values, and Node.js the only one for own keys, descriptors,
definition, and deletion.


Required contract
-----------------

The unit needs:

 -  which functions get own `caller` and `arguments` properties, their
    attributes, and their position among the own keys;
 -  the value of each property for an inactive function and for an active one;
 -  which functions count as a caller and which calls are transparent;
 -  the answer under recursion, exception unwinding, proper tail calls,
    generator and async resumption, and realms;
 -  how definitions, assignments, and deletions of the properties behave;
 -  invariance under specialization policy and collection; and
 -  a per-call cost ceiling for programs that never read either property.


Alternatives considered
-----------------------

1.  **Keep ADR 0028.** Rejected. The maintainer scheduled the extension, and
    the 18 paths without dynamic source stay unsupported only for its lack.
2.  **Match V8 for every built-in function.** Rejected. V8 reports the caller
    of the built-in when a built-in written in C++ calls back, and `null` when
    one written in Torque or CodeStubAssembler does. `JSON.parse` revivers and
    `Date` conversions see the outer function, `Array.prototype.map` callbacks
    see `null`. The split follows V8's choice of implementation language for
    each built-in, which changes between releases and has no counterpart in
    Oseo's runtime.
3.  **Report `null` for every call a built-in function makes, except the
    forwarding built-ins.** Selected. It matches V8 for the forwarding
    built-ins, for syntax-initiated calls, and for every built-in V8 writes in
    Torque or CodeStubAssembler, and it states one rule for the rest.
4.  **Reflect later assignments to parameters in `arguments`.** Rejected. V8
    shows a reassigned parameter only while that parameter lives in an
    interpreter register: a closure capture, a use of `arguments` in the body,
    or a non-simple parameter list each make V8 report the received value
    instead. The received values give one answer for every function.
5.  **Track activations only in functions that read `caller` or `arguments`.**
    Rejected. A read can use a computed key, `Reflect.get`, or a descriptor,
    so no compile-time test finds every reader, and the callee's answer
    depends on every function that may call it.
6.  **Copy V8's descriptors.** Rejected, with two other descriptor shapes.
    V8's non-writable, non-configurable data properties break the invariant
    described under “Observed results”. Keeping that shape and recording the
    two invariant rows as accepted failures would contradict
    *PLAN-LANGUAGE.md*'s exit criteria, and own accessor properties would
    keep the invariant but match V8's descriptors no better than the
    selected shape. The selected shape is configurable data properties.


Probe evidence
--------------

[*docs/evidence/legacy-caller/v8-probe.cjs*](../evidence/legacy-caller/v8-probe.cjs)
runs every case as Script code through `node:vm`, so no CommonJS wrapper
function sits under the top level, and a second `vm` context stands in for a
second realm. Its output under Node.js 24.21.0 is the checked-in
[*v8-probe.txt*](../evidence/legacy-caller/v8-probe.txt), reproduced with
`node docs/evidence/legacy-caller/v8-probe.cjs`. Each choice below cites the
row group of that output. *deno-presence.js* in the same directory checks the
Deno side, and its output is *deno-presence.txt*.


Observed results
----------------

On V8, a non-strict function declaration or expression has own keys `length`,
`name`, `arguments`, `caller`, `prototype`, in that order, and later
properties follow `prototype`. Both added properties report
`{value: null, writable: false, enumerable: false, configurable: false}`
while the function is inactive. Strict, arrow, method, accessor, generator,
async, async generator, class, bound, and built-in functions have neither.
Deletion returns false, a non-strict assignment is ignored, a strict one throws
a `TypeError`, a definition with the current value succeeds, and one with
another value throws (group `own`).

While the function is active, `caller` reports the function whose code made
the most recent call to it. Non-strict arrows, methods, accessors, generators,
async functions, and async generators are reported, including a generator after
it resumes and an async function after an `await`. Strict code, top-level Script
code, and class bodies report `null` (group `caller`).

`Function.prototype.call`, `Function.prototype.apply`, `Reflect.apply`,
`Reflect.construct`, bound functions, and a Proxy without an `apply` trap are
transparent: the callee reports the function that invoked them. A Proxy trap
reports the function whose operation reached the Proxy. `Reflect.apply` of
`Array.prototype.map` reports `null` to the callback, because `map` itself made
the call (group `forward`).

Calls that syntax makes report the running function: `valueOf`, `toString`, and
`Symbol.toPrimitive` from operators, template literals, and computed keys,
iterator methods from `for-of` and spread, `Symbol.hasInstance`, tagged
templates, accessor functions, and Proxy traps reached from a member read
(group `implicit`). Of the 20 built-in functions sampled, 12 report `null` to
the functions they call and 8 report the function that called the built-in
(group `built-in`). The 8 are `JSON.parse`, `JSON.stringify`, `Reflect.set`,
`Object.defineProperty`, `Error`, `Date`, `BigInt`, and
`DisposableStack.prototype.dispose`. Judging from the V8 source tree, these are
implemented in C++ and the 12 in Torque or CodeStubAssembler; that grouping is
an inference, not an observation. A promise reaction job reports `null`.

Recursion reports the caller of the most recent activation, and the answer
returns to the previous activation's after a nested activation returns or
throws. A strict function's call to a non-strict function reports `null`, so
the probe cannot tell whether V8 would keep a replaced frame (group `stack`).

`arguments` is `null` while the function is inactive. While it is active, each
read returns a new extensible object with `[object Arguments]` tag, own keys
`0` to `length - 1`, `length`, `callee`, and `Symbol.iterator`, the attributes
of a mapped arguments object, and %Object.prototype% as its prototype. `callee`
is the function itself. Writing an element does not change a parameter. The
elements are the values the activation received, including bound leading
arguments, except that an uncaptured simple parameter reassigned in an
interpreter frame shows its new value (group `arguments`).

The V8 shape breaks an invariant of the essential internal methods: a
non-writable, non-configurable data property must report the same value on
every later `[[GetOwnProperty]]`. After a program redefines `caller` or
`arguments` with both attributes false, V8 still reports a different value once
the function is active (group `invariant`). test262 checks this in
*consistent-value-function-caller.js* and
*consistent-value-function-arguments.js* under
*test/built-ins/Object/internals/DefineOwnProperty/*. Both rows passed in Oseo
before this record, because Oseo had no such own property. Node.js fails both,
and so did a native build of a draft that copied V8's descriptors.

Across realms, a caller in another realm is reported, a read from another realm
sees the same caller, and the `arguments` object's prototype belongs to the
realm that performs the read. A read through another realm's `Reflect.get`
gets that realm's %Object.prototype% but the `Symbol.iterator` value of the
function's own realm (group `realm`).


Decision
--------

### Properties

A function is created with own `caller` and `arguments` properties exactly
when it is a non-strict `function` declaration or expression that is neither
async nor a generator. Each is a data property that is non-writable,
non-enumerable, and configurable, and whose value is computed when the
property is read; this record calls such a property live. They follow
`length` and `name` and precede `prototype` in own-key order, as on V8.

Every other function, including every built-in, bound, strict, arrow, method,
accessor, generator, async, and class function, keeps inheriting the
%ThrowTypeError% accessors of %Function.prototype%. Arguments objects keep
having no own `caller`.

Because both properties are configurable, the essential-method invariant
holds: no later `[[GetOwnProperty]]` is bound to repeat the value. A
`[[DefineOwnProperty]]` of a live property, including the redefinitions that
`Object.freeze` and `Object.seal` make, first turns it into an ordinary data
property holding the value it has at that moment, then applies the descriptor
as to any configurable property. The property keeps its own-key position. For
an active function's `arguments`, the fixed value is a new arguments object
created at the definition. Deleting a live property succeeds and removes it,
after which a read reaches the inherited %ThrowTypeError% accessor again.
Assignment follows the non-writable attribute: a non-strict one is ignored and
a strict one throws a `TypeError`. A function that still has a live property
is neither sealed nor frozen.

### Differences from V8

Oseo departs from Node.js 24.21.0 in three places, and the fixed programs in
*tests/legacy-caller.test.ts* pin each of them:

 -  `Object.getOwnPropertyDescriptor` reports `configurable: true` for both
    properties, where V8 reports `false`. Deletion and definitions with
    another value therefore succeed where V8 refuses them, and Proxy
    invariant checks accept trap results that V8 rejects.
 -  A built-in function that V8 writes in C++ reports `null` to the functions
    it calls, where V8 reports the caller of the built-in (rule under
    “Activations”).
 -  `arguments` shows the received values, where V8's interpreter shows a
    reassigned uncaptured parameter (rule under “The `arguments` value”).

### Activations

A function is active while one of its calls has started and not yet returned or
thrown. The answer for a function comes from its most recent activation that is
still running. An activation that ends, normally or by an exception, stops
counting immediately, so the previous activation's answer applies again.

`caller` of an inactive function is `null`. For an active one, it is the
function whose code made the call that started the most recent activation, if
that function is non-strict and not a built-in function, and `null` otherwise.
A reported caller may be a non-strict arrow, method, accessor, generator, async
function, or async generator. The value is never a strict function, a class
constructor, or a built-in function.

`Function.prototype.call`, `Function.prototype.apply`, `Reflect.apply`, and
`Reflect.construct` are transparent: the call they make counts as made by the
code that called them. Bound functions and Proxy objects are not functions with
code, so a call through one counts as made by the code that called it, and a
Proxy trap counts as called by the code whose operation reached the Proxy.
Every call made by any other built-in function, including its implicit
`valueOf`, `toString`, accessor, iterator, and trap calls, reports `null`.

Calls that syntax and abstract operations make on behalf of running code count
as made by that code: accessor functions, conversion methods, iteration
protocol methods, `Symbol.hasInstance`, tagged templates, and Proxy traps.
Top-level Script and module code and the host's job and timer dispatch are not
functions, so a call they make reports `null`.

A generator or async function body that resumes after `yield` or `await` is the
caller of the calls it makes after resuming.

A proper tail call never changes an answer. Tail calls occur only in strict
code, so a function that a tail call starts reports `null`, even though Oseo
has already released the strict caller's frame.

### The `arguments` value

`arguments` of an inactive function is `null`. For an active one, each read
creates a new arguments object. Its prototype is the %Object.prototype% of the
running realm at the read, and its `Symbol.iterator` is the
%Array.prototype.values% of the function's realm, as on V8. The object has the
own keys, attributes, and `callee` that V8 reports, with `callee` set to the
function. Its elements are the argument values the most recent activation
received, after bound leading arguments, and they are not mapped to
parameters.

Oseo does not show a later assignment to a parameter. V8 shows one only for a
simple parameter that stays in an interpreter register. The fixed fixtures
pin Oseo's answer, and differential tests avoid reassigning a parameter
before reading `arguments`.

### Realms

Realms do not change who is reported. A caller in another realm is reported,
and a read from another realm sees the same answer. Only the `arguments`
object depends on realms, as stated above.

### Policy invariance and cost

Specialization and collection policy do not change any answer. Activation
tracking is part of every call of generic code, so a guarded specialization
that inlines or skips a call must record the same activation as the generic
fallback.

Programs that never read either property still pay for the tracking. The unit
measures the per-call cost on Linux AMD64 with a call-heavy native benchmark
against its base commit and records it in
[*docs/evidence/legacy-caller/*](../evidence/legacy-caller/). The tracking must
add no allocation to a call and at most 5 percent to that benchmark's median
run time. A later change that exceeds the ceiling revisits this record.

### test262 accounting

The 18 paths under ADR 0028's selector that use no dynamic source become passes
owned by the normal observation owner. The five that call `eval` or a `Function`
constructor keep their OSEO1001 rejection and move to
[ADR 0016](./0016-dynamic-source-boundary.md) through reviewed exclusion audit
rows. They are *test/built-ins/Function/15.3.5.4\_2-12gs.js*, *-14gs.js*, and
*-76gs.js* for `eval`, and *-77gs.js* and *-78gs.js* for `Function` and
`new Function`; [*PLAN-DYN.md*](../../PLAN-DYN.md) records them. The two
invariant rows stay passes. The `caller` feature enters `supportedFeatures`.
Every other row whose observation reflects a non-strict function's own keys or
descriptors is re-observed and reviewed in the same change.


Consequences
------------

Every call through the generic call path records an activation on the
context: the function, the received arguments, and a link to the previous
activation. Built-in functions record one too, so that the functions they call
report `null`. The tail call trampoline records an activation that reports
`null` for each step, and each generator and async resumption records one for
its function. The collector traces the activation records. The runtime ABI
version changes, because generated code tells the runtime which functions are
non-strict.

The property sites that answer a function's `prototype` also answer a live
`caller` and `arguments`, and each function records which of the two are
still live. Because a property query does not allocate, the `arguments`
object is created at the sites that hand a value to code: `[[Get]]`,
`Object.getOwnPropertyDescriptor`, `Object.getOwnPropertyDescriptors`, Proxy
invariant checks, and the definitions that fix a live property's value.

Every non-strict function gains two own keys, so manifest rows that list a
function's own properties change. Software that relies on the extension can
run, within the dynamic-source boundary that ADR 0016 keeps.


Failure modes and replacement triggers
--------------------------------------

 -  A target package that depends on V8's C++ built-in caller answers, or on
    reassigned parameters appearing in `arguments`, reopens the affected rule.
 -  A measured cost above the ceiling on a reference workload reopens the
    tracking design.
 -  A later edition that specifies `caller` or `arguments` as function
    properties replaces the parts it defines.
 -  An optimization that removes or merges calls, such as inlining, must show
    that it records the same activations, or it reopens the policy-invariance
    rule.


Links
-----

 -  [ADR 0028](./0028-legacy-function-caller-boundary.md) is the M5 boundary
    this record supersedes.
 -  [ADR 0016](./0016-dynamic-source-boundary.md) keeps `eval` and `Function`
    outside the profile and takes the five dynamic-source paths.
 -  [ADR 0027](./0027-realms-beyond-the-initial-realm.md) defines the realms
    that the realm rule covers.
 -  [ADR 0032](./0032-post-m5-edition-boundary.md) is the post-M5 claim
    boundary.
 -  [*PLAN-LANGUAGE.md*](../../PLAN-LANGUAGE.md) schedules the unit.
 -  [Forbidden extensions] and [AddRestrictedFunctionProperties] are the
    normative sources.

[Forbidden extensions]: https://262.ecma-international.org/16.0/#sec-forbidden-extensions
[AddRestrictedFunctionProperties]: https://262.ecma-international.org/16.0/#sec-addrestrictedfunctionproperties
