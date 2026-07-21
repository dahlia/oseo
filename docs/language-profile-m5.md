M5 language profile and measurement boundary
============================================

Status
------

Implementation status: active. This is the living M5 profile required by
[*PLAN-M5.md*](../PLAN-M5.md). It starts from the frozen
[M3](./language-profile-m3.md) and [M4](./language-profile-m4.md) profiles
and records how each dependency-indexed capability group stands against the
claim boundary frozen in
[ADR 0013](./adr/0013-m5-edition-and-manifest.md). Every M5 checkpoint that
admits or measures behavior updates this document in the same change.

Unlike the frozen M3 and M4 profiles, this document changes throughout M5.
A group's status describes tested current behavior, never intended behavior.


Claim boundary
--------------

The conformance candidate is the ECMA-262 16th edition, ECMAScript 2025,
with the optional-section policy of ADR 0013: Annex B and ECMA-402 are
outside the claim; host hooks, realms, agents, shared memory, `eval`, the
`Function` constructor, and dynamic import are inside it and remain explicit
gaps until owned decisions land. No release uses the conformance label while
a known language gap remains inside this boundary.

The checked-in compatibility manifest under *tests/test262/* is the source
of truth for progress against this boundary. *subset.yaml* pins the suite
revision, supported features, and expected classifications; *results.yaml*
records the reviewed observations. The checked-in manifest implements the
schema frozen by ADR 0013: five classifications with `expected-negative`
covering matched negatives in every phase, execution evidence with the
executed variants and target, reviewed dependency tags, and summaries with
raw, path-group, and dependency totals. Unsupported and harness results
never increase the pass count.


Capability groups
-----------------

Groups derive deterministically from the upstream test262 path: a group is
the first two directory segments under *test/*, such as
`language/module-code` or `built-ins/Promise`. The table names the groups
the M5 measurement work tracks first and the contract that owns each; it
is not exhaustive, because admitted syntax spans further groups such as
`language/literals`. Measured coverage per group lives in the
*results.yaml* summary; a group may have an admitted subset before its
first reviewed test262 cases land.

| Group                | Status  | Owning contract      |
| -------------------- | ------- | -------------------- |
| language/expressions | partial | M5 profile           |
| language/statements  | partial | M5 profile           |
| language/module-code | partial | M4 profile, ADR 0009 |
| built-ins/Object     | partial | M3 profile, ADR 0008 |
| built-ins/Promise    | partial | M4 profile, ADR 0010 |

“Partial” means the admitted subset in the owning profile document, with
every other form rejected by a source-located diagnostic.


Admitted M5 syntax
------------------

M5 admits these forms beyond the frozen M3 and M4 profiles. Each entry names
its deliberate boundary and its evidence:

 -  The `typeof` and `void` unary operators and the `%` remainder operator.
    `typeof` distinguishes `undefined`, `null`, booleans, numbers, strings,
    callable objects, and other objects; reading a binding before
    initialization throws the same catchable completion as any other read,
    and the allocating result string is a declared MIR safepoint. `void`
    evaluates its operand and produces `undefined`. `%` applies primitive
    numeric coercion and IEEE 754 remainder semantics, including negative
    zero, infinite, and `NaN` operands; object operands convert through
    the shared generic `ToPrimitive`. Native
    differential fixtures, MIR structural tests, and reviewed test262
    cases cover the three operators.
 -  `typeof` applied to a name that does not resolve to a binding is
    rejected with a source-located diagnostic instead of evaluating to
    `"undefined"`. The closed ahead-of-time profile rejects every other
    unresolved reference, and this deviation is explicit rather than a
    silent approximation. The affected test262 case remains classified
    unsupported until an owned decision admits unresolved references.
 -  The `&&` and `||` logical operators and the conditional `?:` operator,
    lowered through explicit MIR branches and a parameterized join block.
    The untaken operand never evaluates, the produced value is the operand
    value rather than a coerced boolean, and evaluation order and abrupt
    completion follow the lowered control flow. `??` and the logical
    assignment operators remain rejected. `await` inside a logical or
    conditional operand is rejected with a source-located diagnostic in
    both async function bodies and module top level, because a
    conditionally evaluated suspension has no owned continuation contract
    yet.
 -  Labeled statements with labeled `break` and `continue`. Labels on
    loops bind to the loop's break and continue targets, labels on any
    other statement are break-only, chained labels share one target, and
    labeled completions cross `finally` blocks through the existing
    completion machinery. The bootstrap parser validates label
    references, so undefined labels, duplicate nested labels, and
    `continue` against a non-loop label stay parse failures.
 -  The `switch` statement with lazy, source-ordered strict-equality case
    tests, fallthrough across clauses including a default clause in any
    position, and one case-block scope shared by every clause, so a
    lexical clause binding read before its clause runs stays a runtime
    TDZ error. `break` targets the switch while `continue` passes
    through to the enclosing loop. Function declarations inside switch
    clauses stay rejected with a source-located diagnostic.
 -  The classic `for` statement with expression, `var`, `let`, `const`,
    and empty heads. Mutable lexical head bindings follow
    `CreatePerIterationEnvironment`: each iteration reads the current
    values, creates fresh cells through the existing binding-reset
    machinery, and re-initializes them, so closures created in the body
    capture one environment per iteration, while a `const` head keeps
    its single environment as the specification requires. `continue`
    re-enters through the update clause after the per-iteration copy.
    `for-in` stays rejected with a source-located diagnostic. The empty
    statement is also admitted as a no-op block.
 -  The `do-while` statement, lowered body-first with the same loop, join,
    `break`, and `continue` structure as `while`. `continue` re-enters the
    loop through the condition, and a body that always completes abruptly
    leaves the condition unreachable rather than approximated.
 -  The `in` and `instanceof` relational operators. `in` converts its key
    through the shared property-key conversion and walks the prototype
    chain with the same visibility as generic property reads, and
    `instanceof` implements `OrdinaryHasInstance` without well-known
    symbols, which the profile does not admit yet. Non-object `in` right
    operands, non-callable `instanceof` right operands, and non-object
    `prototype` values throw catchable `TypeError` instances.
 -  Untagged template literals, normalized by the frontend into string
    concatenation. Substitutions evaluate left to right interleaved with
    the cooked template pieces, and every substitution converts through
    the frontend-synthesized `to-string` conversion, so an object
    substitution applies generic `ToPrimitive` with the string
    preference `ToString` requires rather than the addition operator's
    default hint. Tagged template expressions stay
    rejected with a source-located diagnostic.
 -  Synchronous arrow functions with block and expression bodies,
    reusing the arrow function kind, lexical receiver, and
    non-constructibility the runtime already owns for asynchronous
    arrows. `this` stays admitted only where an enclosing non-arrow
    function provides it, so a top-level arrow reading `this` is
    rejected with a source-located diagnostic instead of approximating
    the script receiver.
 -  `var` declarations with function-scope hoisting, multiple
    declarators, redeclaration, parameter and declared-function name
    sharing, and awaited initializers in async functions and module top
    level. The frontend normalizes each function, script, or module body
    into hoisted bindings initialized to `undefined` plus in-place
    assignments, so no separate binding kind reaches HIR or the runtime.
    Deliberate boundaries, each rejected with a source-located
    diagnostic: `var` destructuring, `export var`, ambient `declare`
    declarations, a `var` sharing a catch parameter name (ECMAScript
    allows it), a `var` sharing a block-level function declaration name,
    because Annex B function hoisting would make the difference
    observable, and an awaited initializer in a declaration list with
    more than one declarator. Top-level Script
    `var` creates a script binding rather than a global-object property;
    the difference is unobservable while `globalThis` remains outside
    the profile, and the `globalThis` gap entry owns the revisit.
 -  The `==` and `!=` loose equality operators, implementing
    `IsLooselyEqual` for the admitted values: nullish pairs are equal, a
    nullish operand compared with anything else is unequal without
    coercion, booleans and numeric strings coerce through the shared
    numeric conversion, and objects compare by identity. Comparing an
    object with a number or string, including a boolean after its
    numeric conversion, converts the object through generic
    `ToPrimitive` with the default hint before comparing again.
 -  The `??` nullish coalescing operator and the comma sequence operator.
    `??` lowers through explicit strict null and undefined checks into
    the same parameterized join structure as the other short-circuit
    operators, so the right operand evaluates only for a nullish left
    value. Sequences evaluate left to right and produce their final
    operand. Logical assignment operators, including `??=`, remain
    rejected, and `await` inside these operands keeps the shared
    rejection. The `coalesce-expression` test262 feature is a supported
    feature of the reviewed subset.
 -  The `**` exponentiation operator, the `&`, `|`, `^`, `<<`, `>>`, and
    `>>>` bitwise and shift operators, and the `+` and `~` unary
    operators. All apply the shared primitive numeric coercion; the
    32-bit operations wrap through explicit modular unsigned arithmetic,
    shifts mask their count to five bits, and exponentiation follows
    `Number::exponentiate` where C `pow` differs, covering `NaN`
    exponents and unit bases with infinite exponents. Object operands
    convert through generic `ToPrimitive`. The `exponentiation`
    test262 feature is now a supported feature of the reviewed subset.
 -  The named error intrinsics `Error`, `EvalError`, `RangeError`,
    `ReferenceError`, `SyntaxError`, `TypeError`, and `URIError` as real
    runtime-owned constructor values. An unshadowed reference to one of
    these names resolves to the lazily created intrinsic; a lexical,
    `var`, parameter, or imported binding shadows it as ECMAScript
    requires. Each constructor is callable and constructible, installs
    the hidden own `message` property from a present message argument,
    honors the ES2022 `cause` option, and exposes `name`, `message`, and
    `constructor` on its prototype, with one shared
    `Error.prototype.toString`. Runtime semantic errors, TDZ reads and
    writes, immutable-binding assignment, nullish property access,
    calling non-functions, invalid array lengths, and the other
    catchable language errors are now instances of the applicable
    `TypeError`, `RangeError`, or `ReferenceError` intrinsic with an own
    `message`, and an unhandled thrown error instance renders as
    `Name: message` inside the owned diagnostic line. Deliberate
    boundaries: assigning to an unshadowed error intrinsic name stays a
    compile-time unresolved-binding rejection, object-valued messages
    convert through generic `ToPrimitive`, and instance `stack`
    properties do not exist.
    Native differential fixtures, runtime C fixtures, MIR structural
    tests, and reviewed test262 cases cover the family, and the runner
    now executes runtime negatives by comparing the rendered error name
    against the expected type, replacing the former blanket
    `runtime-error-types` capability gap with the narrower
    `runtime-error-observation` classification for thrown values without
    error identity.
 -  Generic `ToPrimitive` for object operands, implementing
    `OrdinaryToPrimitive` without well-known symbols: user-reachable
    `valueOf` and `toString` run in hint order with the receiver, an
    object result falls through to the next method, and an object with
    neither convertible method throws a catchable `TypeError`. Objects
    on a default-intrinsics prototype chain use the virtualized
    `Object.prototype` and `Array.prototype` conversions selected by
    the first default-intrinsics provider on the chain: the
    receiver-sensitive `Object.prototype.toString` tags
    (`"[object Array]"`, `"[object Function]"`, `"[object Error]"`
    through the internal error brand, and `"[object Object]"`,
    including promises whose well-known-symbol tag is unreachable) and
    the `join`-based array
    text with element `ToString`, nullish holes as empty elements,
    honored user `join` overrides, cyclic references rendered as empty
    elements, and nesting bounded by the deterministic call-depth
    budget. An object inheriting the virtual function conversion
    without being callable throws the catchable `TypeError` that
    `Function.prototype.toString` requires. A user `Symbol.toPrimitive`
    method, reachable once the program has touched the `Symbol`
    intrinsic, is dispatched first with the specification hint string;
    a non-callable non-nullish method and an object result throw
    catchable `TypeError` instances. The conversion feeds numeric
    coercion, string conversion, addition with the default hint on both
    operands before the string test, relational comparison with the number hint
    in source order, loose equality, property keys, `console.log`, error
    message and `Error.prototype.toString` conversion, and `setTimeout` delays
    through one shared implementation, replacing both the former unsupported
    object-coercion boundary and the timer-only ad-hoc conversion. Deliberate
    boundary: converting a function or promise without a user-supplied method
    to text stays an owned unsupported diagnostic, because faithful text needs
    `Function.prototype.toString` or well-known symbols; a purely numeric
    conversion of such a value produces `NaN` without materializing the text,
    because every function source and promise tag string is non-numeric.
    `@@toPrimitive` dispatch is implemented by the symbols unit. Native
    differential fixtures,
    runtime C fixtures, and reviewed test262 cases cover the conversion.
 -  Symbol values and the `Symbol` intrinsic. `Symbol([description])`
    creates a unique, GC-traced symbol primitive whose description
    converts through the shared `ToString`; `typeof` reports
    `"symbol"`, symbols are truthy, strict and loose equality compare
    identity, and `new Symbol()` throws the catchable `TypeError` a
    non-constructor requires. Symbols are admitted property keys
    end to end: computed access, assignment, `delete`, `in`,
    `Object.getOwnPropertyDescriptor`, and property definition treat
    them as identity-compared keys, while `Object.keys` reports only
    string keys. `ToPropertyKey` passes symbols through and converts
    everything else to a string. Converting a symbol to a number or
    string throws a catchable `TypeError`, and `console.log` renders a
    symbol as `Symbol(description)` the way the host console does. The
    well-known `Symbol.iterator`, `Symbol.toPrimitive`, and
    `Symbol.toStringTag` are fixed non-writable properties of the
    intrinsic, and `Symbol.toPrimitive` methods participate in generic
    `ToPrimitive`. Deliberate boundaries: `Symbol.for`, `Symbol.keyFor`,
    `Symbol.prototype` methods including `toString` and the
    `description` accessor, `Symbol.hasInstance` dispatch in
    `instanceof`, and `Symbol.toStringTag` observation in
    `Object.prototype.toString` remain outside the profile until their
    prerequisites land.
 -  The synchronous iterator protocol. `GetIterator` reads a value's
    `Symbol.iterator` method and calls it, throwing a catchable
    `TypeError` for a non-iterable, a non-callable method, or a
    non-object iterator. `IteratorStep` calls the iterator's `next`
    method, validates the result is an object, and reads its `done` and
    `value` fields; `IteratorClose` calls a present `return` method,
    preserving an in-flight error over a throwing or non-object return
    result. A default array exposes a first-class array iterator
    through its virtualized `Symbol.iterator`: the iterator is an
    ordinary object whose `next` steps the array by re-reading its
    length each call and whose `Symbol.iterator` returns itself, so
    `array[Symbol.iterator]().next()` and user-defined iterables with a
    `Symbol.iterator` method and a `next` method both drive iteration.
    The iterator's next method is captured once by `GetIterator` and
    reused for every step, as the iterator record requires.
    `Promise.all`, `Promise.race`, synchronous `for-of`, and array literal
    spread consume object iterables through this protocol. A `for-of` head
    admits one `const`, `let`, or `var` identifier declaration, an existing
    binding, or a static or computed member target. Lexical declarations
    create their TDZ before the iterable expression and receive a fresh cell
    for each iteration. Normal exhaustion and a failing iterator step do not
    close the iterator; head assignment failures, `break`, `return`, `throw`,
    and transfers to an outer label do. A `continue` targeting the same loop
    keeps the iterator open. Close-time completion follows `IteratorClose`: a
    close failure replaces `break` or `return`, while an in-flight throw stays
    authoritative.
 -  Array literal spread. A literal containing spread allocates an empty rooted
    array and accumulates ordinary values, holes, and iterator values in source
    order. Each value becomes a new own indexed data property without
    consulting the prototype; each hole advances only `length`. Spread captures
    the iterator's `next` method once and never calls `IteratorClose` for
    acquisition, step, value, or append failures. Literals without spread keep
    fixed-length lowering. A spread preceding a later top-level await point is
    rejected because the current continuation representation cannot preserve
    completed iteration without observing it again. Native differential
    fixtures, generated Node, Deno, and native properties under both
    specialization policies and forced collection, MIR structural tests, and
    five reviewed test262 cases cover accumulation. Deliberate
    boundaries: string and other primitive iteration, which the
    specification reaches by boxing, is unsupported; the promise combinators,
    `for-of`, and array spread accept only object iterables. The array iterator
    methods are array-specific rather than the generic
    `%Array.prototype.values%`; and `for-await-of`, call and constructor spread,
    destructuring iteration, array and string iterator prototype identity, and
    generator-based iterators remain outside the admitted syntax.


Known gaps inside the claim
---------------------------

Each gap names its owner. This list shrinks as M5 lands semantic units; it
must never shrink by reclassification alone.

 -  Destructuring, call and constructor spread, default and rest parameters,
    classes, generators, big integers, regular expressions, and the remaining
    expression grammar are outside the admitted syntax. Owner: the core
    expressions and bindings stream in [*PLAN-M5.md*](../PLAN-M5.md).
 -  The intrinsic
    graph behind standard constructors other than the error and symbol
    families is
    unimplemented, and no built-in dispatches through
    `Symbol.hasInstance` or `Symbol.toStringTag` yet. test262 runtime
    negatives whose
    thrown value has no error identity, such as a thrown
    `Test262Error`, classify as unsupported with the
    `runtime-error-observation` capability named. Owner: the intrinsics
    and built-in objects stream.
 -  `globalThis` and the global object do not exist. Admitting them
    requires the intrinsic graph to expose standard constructors as real
    values first, a binding model in which top-level Script `var` and
    function declarations become global-object properties while Script
    lexical declarations stay in the declarative record and module
    bindings remain module-scoped, and an owned
    architecture decision on how a mutable global object meets
    closed-world name resolution before any dynamically created global
    binding is admitted. Owner: the intrinsics and built-in objects
    stream; the surface audit in [*PLAN-M6.md*](../PLAN-M6.md) depends
    on this unit.
 -  `await` is restricted to the M4 positions; asynchronous generators,
    `for await`, and asynchronous module cycles are unsupported. Owner: the
    functions and executable syntax stream.
 -  `eval`, the `Function` constructor, and dynamic import stay explicitly
    unsupported under [ADR 0016](./adr/0016-dynamic-source-boundary.md).
    Reviewed cases that need them carry the `dynamic-source` dependency
    tag, and no release uses an unqualified conformance label while this
    boundary stands.
 -  Realm creation beyond the initial realm, agent clusters, and shared
    memory need runtime and harness capabilities that do not exist yet;
    affected tests name the missing `$262` capability.
 -  The reviewed harness implements *base.js*, *doneprintHandle.js*,
    *compareArray.js*, and *propertyHelper.js* only. Cases that include
    *asyncHelpers.js* or *promiseHelper.js* stay out of the reviewed subset
    until those includes have reviewed implementations. Owner: the
    standards harness expansion in [*PLAN-M5.md*](../PLAN-M5.md).
 -  The native host fails an executable with an unhandled rejection, as
    the M4 event-loop profile requires, while the upstream test262 host
    contract tolerates one. Cases that deliberately leave a rejection
    unhandled stay out of the reviewed subset until a host-profile
    decision reconciles the two. Owner: the modules and asynchronous
    execution stream.
 -  Large intrinsic tables and built-in families land in the owned
    runtime components recorded in
    [*runtime-components.md*](./runtime-components.md).


Measurement workflow
--------------------

`mise run test:test262` executes the reviewed subset and rejects any drift
from the expected classifications. `mise run test262:update` regenerates
*results.yaml* after a reviewed change. Applicable Script cases execute in
every requested strictness mode, and every executed case compares
specialization-disabled and specialization-enabled native observations with
collection forced at every safepoint.

Linux AMD64 and macOS AArch64 execute that same reviewed subset. The canonical
manifest keeps one counted result per upstream path, while
*target-parity.yaml* pins its digest and supported execution targets. A
host-specific run normalizes only the target spelling before comparing the
complete manifest, so any semantic, harness, graph, scheduler, strictness, or
specialization disagreement fails without duplicating compatibility totals.

Module and asynchronous cases execute under the deterministic native
scheduler. Module entries compile through the explicit CLI module goal with
sibling fixtures loaded from the upstream checkout, and their linked graph
is recorded as manifest evidence. Asynchronous cases insert the reviewed
`$DONE` harness and pass only when the completion marker is the final
output line, appears exactly once, and no failure marker was printed.
Module negatives classify by the owned diagnostic phase: an entry parse
rejection is a parse failure, while dependency parse rejections and link
and loader failures are resolution failures observed before any
evaluation.

The reviewed harness deviates from the upstream test262 host contract in
two documented ways. Harness sources are assembled into the compiled
source, so in module cases they become module-scoped bindings instead of
globals; a case whose fixtures need harness globals or whose bindings
collide with harness names stays out of the reviewed subset. The reviewed
`$DONE` prints the bare failure marker because the profile has no generic
string coercion for arbitrary failure values yet.

A newly supported feature moves tests out of `unsupported-profile-feature`
only after every applicable variant executes. A changed upstream revision is
a reviewed manifest change, not an automatic percentage update.


Generated domains
-----------------

M5 measurement work reuses the M4 property infrastructure defined by
[*PLAN-PT.md*](../PLAN-PT.md). New semantic units added during M5 extend the
applicable valid and invalid generators in the same change that admits the
syntax, as required by [*CONTRIBUTING.md*](../CONTRIBUTING.md).
