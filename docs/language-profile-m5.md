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

This profile measures ECMAScript source modules. Loading a binary *.wasm*
module through static module syntax is a future host integration owned by
[*PLAN-WASM.md*](../PLAN-WASM.md); it neither adds an M5 pass nor classifies a
test262 path as unsupported. The WebAssembly JavaScript and web APIs remain M6
work under the same plan.

The checked-in compatibility manifest under *tests/test262/* is the source
of truth for progress against this boundary. *subset.yaml* pins the suite
revision, supported features, and expected classifications; *results.yaml*
records the reviewed observations. The checked-in manifest implements the
schema frozen by ADR 0013: five classifications with `expected-negative`
covering matched negatives in every phase, execution evidence with the
executed variants and target, reviewed dependency tags, and summaries with
raw, path-group, and dependency totals. Unsupported and harness results
never increase the pass count.

The current manifest contains 4,215 reviewed cases: 2,482 passes, 1,179
expected negatives, and 554 unsupported profile features. It records no
semantic or harness failures.


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
    assignment operators remain rejected. Ordinary asynchronous functions
    retain the selected path in their traced suspension frame, so `await`
    is admitted in logical and conditional operands there. Module top level
    keeps its separate source-located rejection for this conditionally
    evaluated suspension.
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
    Declaration heads admit the same recursive array and object binding
    patterns as standalone declarations. Each lexical leaf enters its temporal
    dead zone before initialization, every mutable `let` leaf receives a fresh
    per-iteration cell, and `var` leaves write their hoisted cells.
    Generated Node, Deno, and native evidence uses seed `0x5eed0010` across
    both pattern families, all three declaration kinds, defaults, rest,
    nullish inputs, both specialization policies, and forced collection. Fixed
    fixtures retain temporal dead zones, conditional iterator close, lexical
    closure identity, and post-loop `var` values. Seven reviewed test262 cases
    pin array defaults, trailing object patterns, and object rest.
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
    default hint.
 -  Tagged template expressions, lowered as calls whose first argument is
    the template site's cached cooked array and whose remaining arguments
    are the substitution values in source order. The cooked array and its
    `.raw` array are frozen: their indexed and `length` properties are
    non-writable and non-configurable, both arrays are non-extensible, and
    `.raw` is a non-writable, non-configurable property. An invalid escape
    produces `undefined` in the cooked array while preserving its source
    spelling in `.raw`. Each template site reuses one template object per
    runtime context, while identical source text at distinct sites has
    distinct identity. Member tags retain their receiver, and tag lookup,
    template-object creation, substitutions, and invocation preserve
    ECMAScript evaluation and abrupt-completion order. The runtime ABI is
    `oseo-runtime-m5-29`. Fixed native fixtures cover basic and identity
    tags, cooked and raw text, multiple substitutions, custom return
    values, errors from tags and substitutions, receiver preservation,
    invalid escapes, frozen descriptors, and site identity. Generated
    Node.js, Deno, and native evidence uses seed `0x5eed001a` for empty,
    simple, multiple, nested, and raw-versus-cooked forms under both
    specialization policies and forced collection. Fourteen of the 25
    reviewed cases under *test/language/expressions/tagged-template/* pass
    once M5a Unit 8.1d moves the top-level `this` case from unsupported to
    pass; the eleven cases that remain unsupported retain independent
    dynamic-source, realm, `arguments`, tail-call optimization, and `Array`
    intrinsic prerequisites. The two remaining directory cases stay
    outside the reviewed subset pending their separate review. Unit 7.4 admits
    only the narrow `%Array.prototype.push%` dependency exercised by its
    ordinary-async evidence. The tagged-template cases under `new.target` and
    optional chaining also move from unsupported to pass.
 -  Synchronous arrow functions with block and expression bodies,
    reusing the arrow function kind, lexical receiver, and
    non-constructibility the runtime already owns for asynchronous
    arrows. An arrow never binds `this`, so a `this` expression written
    in one resolves through the nearest enclosing environment that does,
    including the Script or module top level. M5a Unit 8.1d records that
    resolution below.
 -  Ordinary asynchronous functions and asynchronous arrows retain their
    locals, roots, pending completion records, and expression temporaries in a
    traced suspension frame. `await` is admitted throughout ordinary
    expression and control-flow positions, including nested operands, calls,
    compound assignments, conditionals, loops, and `try`, `catch`, and
    `finally`. A fulfilled operand resumes with its value, and a rejected one
    raises a throw completion at the await position, so enclosing handlers and
    cleanup keep their ordinary precedence. The call returns one capability
    promise, every suspension leaves the native stack, and resumption uses the
    centralized promise reaction construction and dispatch paths required by
    [ADR 0022](./adr/0022-async-context-boundary.md). Binding-pattern
    subexpressions keep their existing explicit restrictions, and top-level
    module await keeps its separate continuation model. Fixed native evidence
    covers evaluation order, nested and loop positions, abrupt completion,
    awaited cleanup, heap locals across suspension, both specialization
    policies, false hints, a deliberate guard miss, and forced collection. A
    generated property with seed `0x5eed001d` compares an independent model,
    Node.js, Deno, and both native specialization policies across six position
    families, fulfillment and rejection, ordinary functions and arrows, and
    truthful and false hints. Fourteen existing reviewed test262 cases move
    from unsupported to pass, including
    *await-non-promise-thenable.js*. Its narrow `%Array.prototype.push%`
    dependency reads and converts `length`, performs each indexed write and the
    final length write in strict source order, propagates accessor and
    writability failures, and works when borrowed by an ordinary object. The
    generated manifest records 4,000 cases: 2,352 passes, 1,128 expected
    negatives, and 520 unsupported profile features with no semantic or
    harness failures.
 -  `var` declarations with function-scope hoisting, multiple
    declarators, redeclaration, parameter and declared-function name
    sharing, and awaited initializers in async functions and module top
    level. The frontend normalizes each function, script, or module body
    into hoisted bindings initialized to `undefined` plus in-place
    assignments, so no separate binding kind reaches HIR or the runtime.
    Deliberate boundaries, each rejected with a source-located
    diagnostic: `export var`, ambient `declare` declarations, a `var` sharing a
    catch parameter name (ECMAScript
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
    operand. The `coalesce-expression` test262 feature is a supported
    feature of the reviewed subset.
 -  Optional chaining for static and computed member access and calls:
    `value?.property`, `value?.[key]`, and `value?.(arguments)`. The frontend
    retains each complete chain in parser-independent syntax and HIR, including
    ordinary member and call steps after its first optional step. MIR evaluates
    the base once and branches through explicit strict null and undefined
    checks. A nullish guard produces `undefined` without evaluating its key,
    arguments, property lookup, call, or any later chain step. A live path
    preserves left-to-right key and argument evaluation and retains the member
    receiver for ordinary and optional method calls. Parentheses preserve that
    receiver for a following call while ending the chain's short-circuit
    region, so a non-optional call after a short-circuited parenthesized chain
    still attempts to call `undefined`. The lowering reuses ordinary property
    and dynamic call operations and adds no runtime entry point. Native
    differential fixtures cover null, undefined, other primitives, objects,
    optional property, computed access, calls, multi-step chains, receiver
    preservation, abrupt non-callable values, evaluation order, one base
    evaluation, and skipped keys and arguments. A generated property with seed
    `0x5eed0019` covers the same forms across both specialization policies and
    forced collection. Sixteen reviewed test262 cases pass and twelve
    expected negatives retain the tagged-template, assignment-target, update,
    and invalid `super()` grammar errors. Nine unsupported cases record
    independent prerequisites including dynamic source, `for-in`, restricted
    asynchronous `await` positions, `String`, `Reflect`,
    regular expressions. Optional calls through `super` properties are
    admitted by M5a Unit 8.2 as recorded below.
    The remaining directory case stays outside the reviewed subset because its
    async function reaches `.call` through a function-intrinsic path that is
    not materialized yet.
 -  The `delete` operator for identifier, non-reference, ordinary member, and
    optional-chain operands. A resolved declarative identifier returns `false`
    without reading its cell, including while that cell is uninitialized; an
    unresolvable name returns `true`, including top-level `arguments` in a
    non-strict Script with no global binding. An admitted ordinary function's
    implicit `arguments` object is a resolved binding and returns `false`. A
    `with` environment deletes the first object binding it selects before using
    that static fallback. Strict identifier deletion remains an early error. A
    non-reference operand is evaluated for its effects and abrupt completion
    before `true` is returned.
    An optional chain returns `true` on a nullish guard without evaluating its
    key or later steps, while a live path deletes its final property reference.
    Ordinary and live optional deletion preserve static and computed keys,
    property attributes, strict `TypeError` behavior, and result booleans. A
    computed ordinary member evaluates its key expression before rejecting a
    nullish base but does not convert that key. Private-name deletion remains
    an early error, and deleting a `super` property stays source-located
    invalid until that reference can throw the required runtime
    `ReferenceError`. Deleting a runtime-owned intrinsic identifier also stays
    invalid until the global-object model can make the deletion affect later
    name resolution. Fixed Node.js, Deno, and native fixtures cover both Script
    modes, effects, abrupt completion, live and nullish paths, a false hint, a
    deliberate property-guard miss, both specialization policies, and forced
    collection. A directly generated property uses ordinary seed `0x5eed0023`
    and 16 cases across the same domain; the extended gate uses seed
    `0x5eed0003` and runs 160. Twenty-six applicable reviewed test262 cases pass
    and two strict identifier cases are expected parse negatives.
 -  The `**` exponentiation operator, the `&`, `|`, `^`, `<<`, `>>`, and
    `>>>` bitwise and shift operators, and the `+` and `~` unary
    operators. All apply the shared primitive numeric coercion; the
    32-bit operations wrap through explicit modular unsigned arithmetic,
    shifts mask their count to five bits, and exponentiation follows
    `Number::exponentiate` where C `pow` differs, covering `NaN`
    exponents and unit bases with infinite exponents. Object operands
    convert through generic `ToPrimitive`. The `exponentiation`
    test262 feature is now a supported feature of the reviewed subset.
 -  Compound assignment for identifiers and static or computed member
    references. The arithmetic, exponentiation, bitwise, and shift forms reuse
    their corresponding binary semantics after one checked read. The `&&=`,
    `||=`, and `??=` forms branch on the retained current value, evaluate and
    write the right operand only on the selected path, and preserve anonymous
    function-name inference for identifier targets. Property targets leave
    anonymous functions unnamed. Member assignments evaluate the object and
    key expression once, convert the retained key value for the read, and
    convert it again after the right operand on the taken write path. A
    short-circuited logical assignment skips that second conversion. Plain
    `=` assignment to a computed member likewise retains the raw key and
    converts it only after the right operand, as `PutValue` specifies, so
    a key whose `toString` is observable runs after that operand. Immutable
    and imported targets retain their catchable write errors. Native
    differential fixtures and a generated property with seed `0x5eed000d`
    cover all 15 operators, both target forms, short-circuiting, reference and
    conversion counts, both specialization policies, and forced collection.
    An ordinary asynchronous function retains the reference and current value
    in its traced frame when the right operand awaits. Top-level module await
    keeps its separate continuation restriction.
 -  Prefix and postfix `++` and `--` for identifiers and static or computed
    member references. Each form reads once, coerces through the admitted
    Number path, adds or subtracts one, and performs a checked write. Prefix
    forms produce the assigned value; postfix forms produce the coerced
    previous value. A member target evaluates its object and key expression
    once, then converts the retained raw key separately for the read and write,
    so the conversions may select different properties. Immutable targets keep
    their catchable write errors after coercion. Native differential fixtures
    and a generated property with seed `0x5eed000f` cover both operators,
    both result forms, both target forms, numbers, numeric strings, booleans,
    null, reference and conversion counts, both specialization policies, and
    forced collection, including suppression of key conversion for a nullish
    base. Four reviewed test262 cases cover the four forms, two expected parse
    negatives retain strict `arguments` early errors, and the newly admitted
    classic `for` update promotes an exponentiation case to pass. BigInt update
    semantics remain outside the admitted value profile.
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
    well-known `Symbol.iterator`, `Symbol.toPrimitive`,
    `Symbol.toStringTag`, and `Symbol.asyncIterator` are fixed
    non-writable properties of the
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
    `Promise.all`, `Promise.race`, synchronous `for-of`, array literal spread,
    and call and constructor argument spread consume object iterables through
    this protocol. A `for-of` head admits one `const`, `let`, or `var`
    identifier, array, or object declaration, an existing binding, a static or
    computed member target, or an array or object assignment pattern whose
    leaves are existing targets. Transparent parentheses around existing
    identifier and member targets are normalized before classification.
    Declaration patterns reuse every binding pattern form admitted for
    standalone declarations. Pattern type annotations remain outside this
    syntax unit. Lexical names create their TDZ before the iterable expression
    and receive a fresh cell for each iteration; `var` leaves write their
    existing hoisted cells. Nested array patterns close from the inside out,
    then a default, target, or object-coercibility failure closes the outer
    iterator. Normal exhaustion and a failing iterator step do not close the
    iterator; head assignment failures, `break`, `return`, `throw`, and
    transfers to an outer label do. A `continue` targeting the same loop keeps
    the iterator open. Close-time completion follows `IteratorClose`: a close
    failure replaces `break` or `return`, while an in-flight throw stays
    authoritative. Native differential fixtures and a generated property with
    seed `0x5eed000b` cover all three declaration kinds, array and object
    values, defaults, rest, nullish failure, fresh cells, both specialization
    policies, and forced collection. Assignment patterns preserve the same
    defaults, rest, member-reference evaluation, and inner-before-outer cleanup
    as standalone destructuring assignment. Native differential fixtures and a
    generated property with seed `0x5eed000e` cover array and object patterns,
    identifier and member targets, nullish failure, both specialization
    policies, and forced collection. A nullish member base fails before
    property-key conversion, then nested pattern cleanup completes before the
    outer iterator closes. Fifty-four reviewed test262 cases pin `for-of`
    patterns. Forty-eight cover declarations across all three kinds, including
    42 that exercise compound assignment, and six cover assignment heads.
 -  Array literal spread. A literal containing spread allocates an empty rooted
    array and accumulates ordinary values, holes, and iterator values in source
    order. Each value becomes a new own indexed data property without
    consulting the prototype; each hole advances only `length`. Spread captures
    the iterator's `next` method once and never calls `IteratorClose` for
    acquisition, step, value, or append failures. Literals without spread keep
    fixed-length lowering. A spread preceding a later top-level await point is
    retained in the traced module continuation without repeating completed
    iteration. Native differential
    fixtures, generated Node, Deno, and native properties under both
    specialization policies and forced collection, MIR structural tests, and
    five reviewed test262 cases cover accumulation. Deliberate
    boundaries: string and other primitive iteration, which the
    specification reaches by boxing, is unsupported; the promise combinators,
    `for-of`, array spread, call spread, constructor spread, and array binding
    declarations accept only
    object iterables. The array iterator methods are array-specific rather than
    the generic `%Array.prototype.values%`; and array and string
    iterator prototype identity remain outside the admitted syntax.
 -  Call and constructor argument spread. A call or construction containing
    spread evaluates its target first, then accumulates ordinary arguments and
    spread iterator values from left to right in a rooted private argument
    list. Iterator acquisition, step, value, and append failures do not call
    `IteratorClose`, and an abrupt spread stops later arguments and invocation.
    Intrinsic, method, dynamic call, ordinary construction, and `Promise`
    construction paths share this representation; invocations without spread
    retain fixed positional arguments. Dynamic arity does not bypass admitted
    intrinsic contracts, so `Object.create(...values)` still rejects a
    descriptor-map argument. A spread preceding a later top-level await point
    retains the accumulated argument list in the traced module continuation.
    Native differential fixtures, generated Node, Deno, and
    native properties under both specialization policies and forced collection,
    and MIR structural tests cover the dynamic-list path. Ten reviewed test262
    cases pin iterator acquisition and step failures across calls and
    construction. Call and constructor spread inherit the object-iterable
    boundary.
 -  Array binding declarations. A standalone one-declarator `const` or `let`
    statement and each declarator in a standalone `var` statement admit empty
    patterns, elisions, defaults, nested array patterns, and a final identifier
    or nested array rest target. Every lexical name enters its temporal dead
    zone before the initializer runs. Each `var` name is function-scope hoisted,
    initialized to `undefined`, and written in source order; declaration lists
    may mix plain and array declarators. Lowering
    evaluates the initializer once, captures `next` once per pattern, steps
    from left to right, and applies a default only when the iterated value is
    `undefined`. Rest exhausts its iterator into a new array. Normal or abrupt
    completion closes every non-exhausted iterator from the inside out, while
    normal exhaustion and a failing iterator step do not close. An in-flight
    throw remains authoritative over a close failure. Direct awaited
    initialization or writing is supported in asynchronous functions and
    modules, and a lexical module export exposes every bound name. Native
    differential fixtures and
    generated Node, Deno, and native properties cover values, temporal dead
    zones, function-name inference, cleanup precedence, both specialization
    policies, and forced collection. Twenty-four reviewed test262 cases cover
    all three declaration kinds, values, defaults for holes and exhausted
    iterators, function-name inference, nested patterns, rest, and iterator
    done-state handling. Inline array and tuple TypeScript annotations map
    syntactically visible required primitive members to binding leaves.
    Direct fixed-length tuple spreads expand before mapping, including members
    before a following suffix. Expanded members follow the ordinary
    primitive-hint and unsupported-type rules. Optional members and ambiguous
    positions after a variadic array rest or type-reference spread remain
    unhinted. If an inline annotation gives a nested array binding subtree
    another container shape, that subtree remains unhinted without a diagnostic
    while matching siblings continue to map. Root container mismatches and type
    annotations that require resolution remain source-located unsupported
    boundaries. Assignment member targets and `export var` remain outside this
    array declaration syntax unit; M5a Unit 8.3 later admits `await` inside a
    default, as recorded below.
 -  Object binding declarations. A standalone one-declarator `const` or `let`
    statement and each declarator in a standalone `var` statement admit static,
    computed, shorthand, renamed, defaulted, and recursively nested object or
    array properties. Every lexical name enters its temporal dead zone before
    the initializer runs, and every `var` name joins function-scope hoisting.
    Lowering applies `RequireObjectCoercible` before the first property name,
    converts each key through `ToPropertyKey`, reads through `GetV` from left to
    right, and applies a default only to `undefined`. Strings expose their
    admitted indexed and `length` properties; other non-nullish primitives
    produce `undefined` for absent properties. Direct awaited initialization or
    writing is supported in asynchronous functions and modules, and lexical
    module exports expose every bound name. Native differential fixtures and a
    generated property with seed `0x5eed0008` cover values, temporal dead zones,
    function-name inference, computed and default order, symbol keys, primitive
    inputs, nullish failure, both specialization policies, and forced
    collection. A final identifier rest target snapshots own keys in ECMAScript
    order, excludes each evaluated static, computed string, or computed symbol
    key, skips non-enumerable and inherited properties, and creates writable,
    enumerable, and configurable data properties on a fresh object. A second
    generated property with seed `0x5eed0009` covers `const`, `let`, and `var`,
    both specialization policies, and forced collection. Twenty-four reviewed
    test262 cases cover all three declaration kinds, nullish coercibility,
    trailing shorthand properties, function-name inference for function, arrow,
    and covered expressions, plus rest exclusions, fresh data descriptors, and
    non-enumerable omission. Inline object TypeScript annotations map
    syntactically visible required primitive members to binding leaves.
    Optional members remain unhinted. If an inline annotation gives a nested
    array or object binding subtree another container shape, that subtree
    remains unhinted without a diagnostic while matching siblings continue to
    map. Root container mismatches and type annotations that require resolution
    or otherwise lack an admitted concrete syntactic shape remain source-located
    unsupported boundaries. Assignment member targets and `export var` remain
    outside this object declaration syntax unit; M5a Unit 8.3 later admits
    `await` inside a property name or default, as recorded below.
 -  Synchronous function binding-pattern, default, and rest parameters. Function
    declarations, constructors, and arrows accept recursive array and object
    patterns plus top-level defaults and rest. The frontend retains plain
    hidden ABI parameters for patterns and performs `BindingInitialization` in
    a parameter environment outside the function body. Initializers therefore
    run from left to right, later parameters remain in their temporal dead
    zones, and body declarations are not visible to defaults. A top-level
    default runs only for `undefined`. A rest parameter collects every unbound
    generic call argument into a fresh array before any pattern initialization.
    Identifier parameters retain their TypeScript and JSDoc hints. Name-based
    JSDoc hints for a pattern-bound name attach to that owned binding leaf
    rather than the hidden aggregate ABI parameter. Inline object, tuple, and
    array TypeScript annotations map syntactically visible primitive member
    types to the corresponding binding leaves without invoking a TypeScript
    type checker. The same mapping covers standalone declarations and classic
    `for` declaration heads. Optional members remain unhinted. Array element
    types continue through unambiguous nested array rest targets. Direct
    fixed-length tuple spreads expand before mapping, so their members and
    following suffix retain their syntactic positions. Expanded members follow
    the ordinary primitive-hint and unsupported-type rules. Variadic array rests
    and type-reference spreads remain unhinted where their length makes a
    position ambiguous. Object targets inside an array rest remain unhinted.
    Computed object properties remain unhinted even when their source key is a
    literal. A nested array or object binding subtree whose inline annotation
    has another container shape remains unhinted without a diagnostic, while
    matching siblings continue to map. Root container mismatches and type
    annotations that require resolution, including alias or interface
    references, remain source-located unsupported boundaries. Ordinary
    functions retain dynamic `this`, arrows retain lexical `this`, and
    constructors initialize their receiver before parameter work. JavaScript
    function length is retained independently from the ABI parameter count.
    Native differential fixtures and generated properties with seeds
    `0x5eed0011`, `0x5eed0012`, `0x5eed0013`, and `0x5eed0014` cover both
    pattern families, supplied, missing, explicit `undefined`, and nullish
    inputs, abrupt initializers, bounded and heap-valued rest suffixes, absent,
    truthful, and false pattern-bound JSDoc and TypeScript hints, both
    specialization policies, function-name inference, forced collection, and
    body `var` declarations that share parameter names. A list containing a
    parameter expression gives
    a shared name distinct parameter and body cells, while a list without
    parameter expressions reuses the parameter cell. When a top-level body
    function declaration and `var` share that name, the function declaration
    owns the body binding without a second synthetic declaration. Asynchronous
    functions and arrows run the same initialization inside their owned
    asynchronous executor, so an abrupt initializer rejects the returned
    promise without entering the body or throwing from the call. Twenty-seven
    reviewed
    test262 cases cover array values, nested defaults and rest, abrupt
    completion, top-level fallback and suffix selection, prior references,
    function length, the parameter and body environment split, asynchronous
    default selection, and promise rejection.
 -  The non-strict `arguments` object for ordinary functions, function
    expressions, object methods, constructors, and synchronous generators.
    HIR and MIR carry one implicit binding identity, and the generated
    function prologue initializes its cell from the generic call ABI before
    parameter initialization. Each invocation receives a fresh ordinary,
    unmapped object whose indexed properties snapshot every supplied argument,
    whose `length` records the supplied count, and whose `callee` is the
    enclosing function. Indexed properties are writable, enumerable, and
    configurable; `length` and `callee` are writable and configurable but
    non-enumerable. A parameter named `arguments` remains an explicit binding
    and suppresses the implicit one. Strict functions, arrows, class methods,
    and asynchronous functions do not receive or capture this binding, so an
    otherwise unresolved reference keeps the ordinary source-located
    diagnostic. Parameter-index aliasing through a mapped arguments exotic
    object remains outside this ordinary-object unit. The runtime ABI is
    `oseo-runtime-m5-29`. A generated property with seed `0x5eed001b` covers
    zero to six bounded arguments, in-range and absent indexed reads, writes,
    `length`, `callee`, fresh identity, both specialization policies, and
    forced collection. Fixed native evidence also covers property
    descriptors, object methods, and synchronous generators. Six reviewed
    no-strict test262 cases from *test/language/arguments-object/* cover empty
    calls despite formal parameters, `callee` identity and descriptors,
    writes, and deletion.
 -  The non-strict `with` statement. Its object expression evaluates once and
    passes `RequireObjectCoercible` before the body can run. HIR retains each
    intervening object environment for an identifier reference. MIR tests
    those environments from innermost to outermost before using the nearest
    declarative binding or an uninitialized fallback, and fixes the selected
    reference before an assignment evaluates its right operand. Nested
    declarative scopes stop an outer object environment from bypassing a
    nearer lexical binding. Reads, writes, method receivers, closures, nested
    `with` statements, and abrupt exits preserve that resolution order. Strict
    source keeps the required parse-time rejection. Fixed native evidence also
    covers one-time object evaluation, fallback reads and writes, captured
    object environments, nested environments, abrupt completion, and a
    nullish `TypeError`. Eleven reviewed cases from
    *test/language/statements/with/* record eight passes, one expected parse
    negative, and two unsupported global-binding dependencies.
 -  Catch binding patterns. A catch parameter admits every array and object
    binding pattern supported by standalone declarations, including defaults,
    nested patterns, array rest, and final identifier object rest. Every bound
    name receives a fresh uninitialized catch cell before the thrown value
    enters `BindingInitialization`, so defaults observe catch-parameter TDZ and
    closures from repeated catch evaluations retain distinct cells. Array
    patterns preserve iterator acquisition, step, conditional close, nested
    close order, and throw precedence. Object patterns preserve nullish checks,
    computed-key and default order, symbol exclusions, and
    `CopyDataProperties`. A pattern failure skips the catch body and propagates
    through an enclosing `finally`. Native differential fixtures and a
    generated property with seed `0x5eed000a` cover array and object values,
    defaults, rest, nullish failure, both specialization policies, and forced
    collection. Sixteen reviewed test262 cases cover array values, defaults,
    function-name inference, nested rest, object nullish failure, trailing
    properties, and object rest descriptors. Assignment member targets and
    pattern type annotations remain outside this syntax unit; M5a Unit 8.3
    later admits `await` inside a property name or default, as recorded
    below.
 -  Destructuring assignment with identifier and member targets. An assignment
    expression admits recursive array and object patterns whose leaves and rest
    targets name existing bindings or evaluate static or computed member
    references. Transparent parentheses around identifier and member targets
    are normalized before classification. The expression evaluates the right
    operand once before pattern work and produces that original value. A member
    leaf evaluates its object and computed-key expression before the
    corresponding iterator step, source property read, or default, then
    converts the key and stores after selecting the value. Array patterns
    retain iterator acquisition, captured `next`, defaults, nested patterns,
    rest, conditional close, and throw precedence. Object patterns retain the
    coercibility check before computed source keys, ordered `ToPropertyKey` and
    `GetV`, defaults, nested patterns, symbol exclusions, and
    `CopyDataProperties`. Identifier leaves use ordinary checked writes, so
    assignment to an immutable local or imported binding keeps its specified
    catchable error. Direct awaited right operands resume before any pattern
    work in asynchronous functions and modules. Await inside a member target
    was rejected at this unit until an owned continuation contract existed for
    that nested suspension position; M5a Unit 8.3 supplies it and admits the
    position in asynchronous bodies, as recorded below.
    Native differential fixtures cover identifier and member targets.
    A generated property with seed `0x5eed000c` also covers parenthesized member
    targets, array and object inputs, defaults, rest, nullish failure, result
    identity, both specialization policies, and forced collection. Fourteen
    reviewed test262 cases add strict and non-strict evidence for identifier and
    member writes, nested patterns, defaults, rest, result identity, nullish and
    immutable target errors, and function-name inference. Synchronous `for-of`
    assignment heads reuse this pattern and target contract. Pattern type
    annotations remain outside this syntax unit; M5a Unit 8.3 later admits
    `await` inside a source property name, default, or member target, as
    recorded below.
 -  Basic object literal expressions. An object literal creates a fresh
    ordinary object and adds each data property, shorthand property, and
    method definition as an own writable, enumerable, configurable data
    property in source order, reusing the generic object allocation and
    property write paths already built for object rest destructuring. Each
    property value evaluates left to right, and its storage growth is a
    declared MIR safepoint. A shorthand property reads the value of an
    existing binding with the same name as its key. A method definition
    creates a function whose dynamic `this` binds the call-site receiver
    like any other function and reuses the existing anonymous-function name
    inference so its name matches its key, but whose distinct runtime
    function kind keeps it non-constructible and without an own `prototype`
    property, unlike the constructible functions created by function
    declarations and function expressions; arrow functions remain
    non-constructible and prototype-less for the separate reason that they
    already bind lexical `this`. Computed property keys were already
    admitted by prior work. Getter and setter accessors are also admitted:
    each accessor evaluates its key and installs a runtime accessor
    property that dispatches through the property lookup and assignment
    paths already built for other property kinds. An accessor property is
    always configurable and enumerable, and a later accessor or data
    property for the same key replaces an earlier one in source order,
    matching the existing last-definition-wins rule for data properties.
    Object spread properties are also admitted: a spread evaluates its
    source expression at its position in source order and copies every own
    enumerable property of that source, including symbol keys, into the
    object under construction as a writable, enumerable, configurable data
    property, in the source's own-key order. A getter on the source is
    invoked once and its result stored as data, and a later property or
    spread replaces an earlier key's value while keeping the key's first
    insertion position. A nullish source copies nothing rather than
    throwing, unlike an object binding rest, and a non-nullish primitive
    source copies the own enumerable properties its wrapper exposes, so a
    string source contributes its index properties and every other
    primitive contributes none. The runtime shares one
    `CopyDataProperties` helper between object binding rest, which copies
    into a fresh object with excluded keys, and object spread, which
    copies into the literal's object with no excluded keys. Deliberate
    boundaries: M5a Unit 8.1c gives the noncomputed colon-form `__proto__`
    property its prototype-setter semantics. Computed, shorthand, method,
    accessor, and spread forms remain ordinary own properties. An object spread
    preceding a later top-level await point remains completed in the traced
    module continuation.
    Native differential
    fixtures retain the empty object, single and multiple data properties,
    shorthand from a local binding and from a parameter, a method's `this`
    reference and non-constructible identity, getter-only and setter-only
    accessors, an accessor pair's shared descriptor, a data property
    redefined to an accessor and back, nested object literals,
    left-to-right evaluation order, abrupt completion in a property value,
    and forced collection across property safepoints, and add empty,
    plain, getter-backed, interleaved, overwriting, integer-key, nullish,
    primitive, array, function, prototype-chain, non-enumerable, and
    symbol-keyed spread sources plus an abrupt spread source and a
    spread-driven growth loop. A generated property with seed
    `0x5eed0015` covers zero to four data, shorthand, method, getter,
    setter, object spread, and nullish spread properties over a shared
    five-name key pool and bounded integer values across Node.js, Deno,
    both specialization policies, and forced collection on the enabled
    path. V8 enumerates an accessor defined after a spread property last
    instead of in property-creation order, so the generated suite rewrites
    such an accessor as a data property and the fixed
    *tests/fixtures/object-spread-accessor-order.js* native scenario
    asserts the ECMA-262 order without a reference observation. Three
    hundred thirty-eight reviewed test262 cases cover property-name forms,
    method definitions, non-constructible method identity, getter and
    setter accessor forms, object spread sources, and the destructuring
    parameter patterns their method bodies already supported.
 -  Synchronous generator functions. `function*` declarations and function
    expressions are admitted with `yield` in any admitted expression
    position, including inside loops, conditionals, `switch`, labeled
    statements, and `try` blocks. Calling a generator function runs its
    environment and parameter prologue immediately and returns a suspended
    generator object whose `[[Prototype]]` is the function's own
    `prototype` object; the body itself runs only on resumption.
    `%GeneratorPrototype%.next(value)` resumes the saved state, delivers
    `value` as the result of the awaiting `yield`, and returns a fresh
    `{ value, done }` object. A body that runs to completion reports its
    return value with `done` true, and every later resumption reports
    `{ undefined, true }`. Resuming a generator that is already running
    throws a `TypeError`, and a body that throws completes the generator
    and propagates the thrown value. A generator function is not
    constructible, so `new` on one throws a `TypeError`, and its
    `prototype` object carries no `constructor` property. Each generator
    function's `prototype` object inherits from one shared
    `%GeneratorPrototype%` that the context creates lazily and roots
    permanently; that intrinsic serves the virtualized `next`, `return`,
    and `Symbol.iterator`, so all three resolve through the specified
    lookup order and an own property on the function's `prototype`, or a
    replacement `prototype` object, shadows them. A `prototype` that is not an
    object falls back to `%GeneratorPrototype%` as
    `GetPrototypeFromConstructor` requires. `next` reports a `length` of 1 and
    a `name` of `next`, and `return` reports the same `length` with a `name` of
    `return`. `return(value)` resumes a suspended body with a return
    completion, so every enclosing `finally` and iterator close runs before the
    generator reports `{ value, done: true }`; a `finally` that yields reports
    `{ yielded, done: false }` and one that returns or throws overrides the
    requested completion. A generator suspended at its start or already
    completed reports `{ value, true }` without entering the body, and a
    running one throws a `TypeError`. `IteratorClose` reaches that method, so a
    `for-of` that breaks, an array binding pattern that stops early, or any
    other consumer that abandons a generator runs its cleanup. A generator is
    therefore its own iterable and works with `for-of`, array spread, call
    spread, and array destructuring. Completing a generator, normally or
    abruptly, discards its `[[GeneratorContext]]`, so a retained completed
    generator does not keep its suspended object graph reachable. A generator
    body's root slots, saved completion records, and iterator done state live
    in its generator record rather than on the native root stack, so a
    suspended generator leaves no live C frame, a suspension taken while a
    `for-of` or array binding is still stepping resumes with that iterator's
    progress intact, and the collector traces its frame through the generator
    object. `yield* operand` gets the operand's iterator once and forwards
    every resumption to it. A normal resumption calls the iterator record's
    captured `next` with the value the resumption delivered; the first step
    always sends `undefined`, because the resumption that entered the
    delegating expression is not the one it forwards. A step that is not done
    suspends with the inner iterator's own result object, which the delegating
    generator reports unchanged, so a result that omits `done` or carries
    extra properties reaches the outer consumer intact, and `value` is read
    only on the step that reports exhaustion. That value is the delegating
    expression's own result. A return resumption reads the inner iterator's
    `return` method instead: an iterator with no such method, or one whose
    result is done, ends the delegation, and the body then leaves through the
    return completion so every enclosing `finally` and iterator close still
    runs; a result that is not done suspends the same way, so a `return` the
    inner iterator refuses does not end the outer generator. No step closes
    the inner iterator on an abrupt completion, because that completion came
    from the inner iterator itself. `yield*` therefore delegates to arrays,
    other generators, nested delegations, and any hand-written iterable, and
    an `IteratorClose` on the delegating generator reaches the delegated
    iterator first. `%GeneratorPrototype%.throw(value)` resumes a suspended
    body with a throw completion, which an enclosing `catch` can handle.
    Synchronous `yield*` forwards that completion to the inner iterator's
    `throw` method; a missing method closes the iterator and raises a
    `TypeError`. Generator method definitions are admitted in object literals
    and in prototype, static, and private class elements. Generator parameters
    admit defaults and
    recursive array and object binding patterns through the same parameter
    environment as synchronous functions. Their initialization prefix runs
    during the generator call, including abrupt completion and later-parameter
    temporal dead zones, before the suspended body can first resume. Simple
    and rest parameters keep the ordinary call ABI. `%GeneratorPrototype%`
    exists as a reachable object with virtualized methods rather than own
    properties, and
    `%GeneratorFunction%` and `%GeneratorFunction.prototype%` are not
    materialized at all, matching how the array iterator prototype is already
    virtualized. ECMAScript exposes no `GeneratorFunction` global binding, so
    admitting one would be a deliberate divergence rather than a step toward
    the intrinsic; every specified route to `%GeneratorFunction%` starts at
    `Object.getPrototypeOf(function* () {})`, which this profile does not
    admit, and creating a generator function from one needs the dynamic-source
    boundary that [ADR 0016](./adr/0016-dynamic-source-boundary.md) leaves
    closed. Native differential fixtures retain a single yield, several
    yields, a bare `yield` with and without a sent value, an empty generator,
    sent values threaded through an accumulator, generator function `length`,
    `name`, and inferred `name`, rest parameters, yields inside `for` and
    `while` loops, per-iteration closure capture across a suspension, yields in
    `try`, `catch`, and `finally` blocks, an abrupt body completion and the
    completed state after it, deferred body entry, self-iterability,
    non-constructibility, a shared `next` identity across two generator
    functions, a non-object `prototype` falling back to the intrinsic, an own
    `next` on a replacement `prototype`, spread over a generator, a dynamic
    `this` receiver, hand-written delegation over another generator, the
    already-running `TypeError`, independent generator identities, object
    growth across suspensions under forced collection, suspensions taken
    inside `for-of` loops and array binding patterns, and every `return`
    path: an implicit close from `for-of` and array destructuring, an
    explicit close before the first resumption and after completion, a
    `finally` that yields, returns, or throws, and a nested close that closes
    an inner generator as well. A generated property with seed `0x5eed0016`
    covers zero to four suspension steps placed at statement level, inside a
    conditional, inside a loop, inside nested loops, and inside a `for-of`
    over a nested generator, wrapped in a cleanup-observing `try`/`finally`,
    driven by a bounded cycle of sent values and either drained or closed with
    `return` after a bounded number of yields, across Node.js, Deno, both
    specialization policies, and forced collection on the enabled path.
    Fixed synchronous and asynchronous native fixtures cover top-level and
    nested defaults, recursive array and object patterns, rest bindings,
    explicit `undefined` and `null`, call-time abrupt completion,
    later-parameter temporal dead zones, and false hints. A generated property
    with seed `0x5eed001d` uses an independent call-time initialization oracle
    over both generator kinds, both recursive pattern kinds, missing, present,
    `undefined`, and `null` inputs, both specialization policies, truthful and
    false JSDoc and TypeScript hints, deliberate guard misses, and forced
    collection on the enabled path. Four hundred thirteen reviewed test262
    cases move from unsupported to passing while the other reviewed
    generator-parameter cases retain their independently observed
    classifications.
    A generated property with seed `0x5eed0017` covers caught and uncaught
    throw resumptions, and one with seed `0x5eed0018` covers generator methods
    in object literals and prototype, static, and private class elements
    against Node.js, Deno, and native execution.
    Fifty-nine reviewed test262 cases newly pass and forty-nine new expected
    negatives cover generator declarations and expressions, `prototype` and
    `length` descriptors, `name` inference, non-constructibility, `yield` as a
    statement, operand, spread element, and property name, consecutive and lone
    yields, executing-state reentry, and the strict-mode `yield` early errors.
    Admitting the `generators` feature also promotes fifteen existing
    module-code parse negatives from unsupported to expected negatives.
    Implementing `%GeneratorPrototype%.return` adds seventeen newly passing
    reviewed cases from *test/built-ins/GeneratorPrototype/return/*, covering
    the completed, executing, and suspended-start states and the `try`/`catch`
    and `try`/`finally` resumption paths, alongside two honestly unsupported
    receiver cases that reach the method through the unmaterialized
    `%GeneratorFunction%` chain. Admitting `yield*` adds fixed fixtures for
    delegation to another generator with sent values and a result, to an
    array, through two nested delegations, inside a counted loop, over a
    hand-written iterator whose result object passes through unchanged, and
    over one that omits `return`, refuses a `return`, is not iterable, throws
    from `next`, or reports a non-object result, plus an explicit and an
    implicit close that reach the delegated iterator first and object growth
    across delegated suspensions under forced collection. The generated
    generator property gains `yield*` steps that forward an inner generator's
    values alone and that fold its result into the body's total. Twenty-one
    reviewed cases from _test/language/expressions/yield/star-\*_ newly pass,
    covering array and iterable operands, the `GetIterator`, `next`, and
    `return` error paths, the `done` and `value` read order, the delegating
    expression's result, and a return completion forwarded to an iterator with
    no `return` method, with one new expected negative and four honestly
    unsupported cases that need `arguments`, the `Boolean` intrinsic, or an
    unresolvable reference. The fourteen `star-rhs-iter-thrw-*` and
    `star-throw-is-null` cases have not yet entered the reviewed subset, and
    `star-string` stays out until strings are iterable. The twenty-three
    reviewed
    *test/built-ins/GeneratorFunction/* cases are recorded as unsupported with
    the `dynamic-source` dependency tag, so the intrinsic boundary stays
    visible in the manifest rather than absent from it.
 -  Basic class declarations and class expressions. A class body is lowered
    to one HIR class expression that creates the constructor closure, reads
    its prototype object, defines each prototype method, and initializes the
    class-scope name binding, in ClassDefinitionEvaluation order. The
    constructor is created with a distinct runtime function kind that is
    constructible like an ordinary function, so `new Foo()` allocates a
    receiver from `Foo.prototype`, runs the body with that receiver as
    dynamic `this`, and reports an object the body returns in place of the
    receiver. Unlike an ordinary function it is never callable without
    `new`: a plain call throws a `TypeError` before the body runs, matching
    `[[IsClassConstructor]]`. Its `prototype` object is non-writable,
    non-enumerable, and non-configurable, and carries the writable,
    non-enumerable, configurable `constructor` property back to the class. A
    body that omits `constructor` gets a synthesized empty constructor with
    a `length` of zero. Each method definition reuses the non-constructible
    method function kind and the anonymous-function name inference already
    built for object literal methods, so a method has no own `prototype`
    property, its `name` matches its key for both static and computed keys,
    and `new` on one throws a `TypeError`. Unlike an object literal method,
    a class method is installed as a writable, configurable,
    non-enumerable data property, so `Object.keys` on a class prototype is
    empty and a later definition for the same key still replaces an earlier
    one. A named class binds its name immutably in the class's own lexical
    environment. The constructor and every method reach that binding, an
    outer class declaration binding of the same name stays assignable
    without affecting it, and assigning the inner name from inside the class
    body throws a `TypeError` because the class body is strict. The
    class-scope cell is created by the same `binding-reset` machinery
    per-iteration lexical bindings already use, so a class expression
    evaluated repeatedly produces one cell per evaluation, and it is
    initialized only after every element is defined, so a computed key that
    reads the class name observes its temporal dead zone. A class
    declaration binds its name the way `let` does: lexically scoped,
    assignable, and unreachable before the declaration runs, and a `var`
    sharing its name in the same scope is rejected. A computed element key
    is class-body code, so it is strict even inside a non-strict script:
    MIR carries an operation-level strictness flag that raises property
    assignment and deletion above the enclosing function's own strictness
    for exactly that region. Named evaluation applies
    to an anonymous class expression exactly as it does to an anonymous
    function expression, so `const Foo = class {}` reports a `name` of
    `Foo` while `const Foo = class Bar {}` reports `Bar`, including when
    the storage key is a computed object literal key that only reaches the
    closure at run time. Deliberate boundary: `export default class` is
    rejected with a source-located diagnostic.
    Asynchronous class methods are admitted, because they reach the same
    lowering object literal async methods already use. Generator and
    asynchronous generator methods are admitted through the same prototype,
    static, and private method-definition paths. Native differential fixtures
    retain the empty class,
    constructor-assigned fields, a method's `this` and prototype placement,
    class `name` and `length`, descriptor observations for `prototype`,
    `constructor`, and a method, method non-constructibility, the
    call-without-`new` `TypeError`, an object-returning and a
    primitive-returning constructor, per-call class identity from a factory
    function, anonymous and named class expressions, the inner name binding
    and its immutability, class declaration temporal dead zones,
    computed-key evaluation order and abrupt completion, last-definition-
    wins for a duplicate method name, a nested class inside a method, an
    anonymous class named from a computed object literal key, a
    strict-mode rejection inside a class method in a non-strict script, and
    a computed key in a non-strict script that assigns to a non-writable
    property or deletes a non-configurable one. A
    generated property with seed `0x5eed0017` covers class declarations,
    named class expressions, and anonymous class expressions with zero to
    two constructor-assigned fields and zero to three prototype methods over
    static and computed keys, across Node.js, Deno, both specialization
    policies, and forced collection on the enabled path. Seventy-six
    reviewed test262 cases newly pass and forty-four new expected negatives
    cover class name identifiers and their escaped forms, method property
    names over every reserved word, computed method definitions,
    `constructor` and `prototype` property descriptors, method default,
    trailing-comma, and rest parameter forms, class-scope name lexical open
    and close observations, and the strict-mode and duplicate-binding early
    errors. Ten deliberately unsupported cases record the static,
    generator-method, `extends`, and `super` boundaries in the manifest. The
    ten `forbidden-ext` cases that assert a class method has no own `caller`
    or `arguments` property stay out of the reviewed subset until
    `Object.prototype.hasOwnProperty` exists; the property they check already
    holds, but the assertion itself needs an intrinsic this profile does not
    provide.
 -  Class getter and setter accessors on the prototype. A `get` or `set`
    class element reuses the `property-define-accessor` MIR operation that
    object literal accessor clauses already use, so a class getter and
    setter pair under one key becomes one accessor property whose absent
    slot is preserved from the earlier definition, an accessor replaces an
    earlier data property under the same key, and a later method definition
    replaces the accessor. The operation now carries the enumerability of
    the property it defines: a class accessor is configurable and
    non-enumerable, unlike an object literal's enumerable accessor clause,
    so `Object.keys` on a class prototype stays empty. The accessor closure
    is the same non-constructible method kind class methods use, so it has
    no own `prototype` property and `new` on it throws a `TypeError`, and
    its `name` takes the `get ` or `set ` prefix the runtime already applies
    to object literal accessors, for identifier, string literal, numeric
    literal, computed, and symbol keys alike. A getter's parameter list must
    be empty and a setter's must be exactly one non-rest parameter; the
    frontend reports the violation and a literal-keyed accessor named
    `constructor` with a source-located diagnostic, while a computed key
    that evaluates to `"constructor"` defines an ordinary prototype
    accessor. Native
    differential fixtures cover a getter, a setter, a getter and setter
    pair, the round trip through both halves, `name` and `length` for both
    halves, the accessor property descriptor and its `enumerable` and
    `configurable` attributes, accessor non-constructibility, a rejected
    write to a getter-only accessor from strict class-body code, an
    accessor on an anonymous class expression, name inference across
    identifier, string literal, numeric literal, computed, and symbol keys,
    computed accessor key evaluation order, a getter replacing a getter
    while its paired setter survives, an accessor replacing a method, a
    method replacing an accessor, and a setter whose single parameter is an
    array pattern or carries a default. The generated class property suite
    now draws each prototype element as a method, a getter, a setter, or a
    getter and setter pair, and models the accessor descriptor, both
    accessor names, the setter round trip, and the two key evaluations a
    computed pair performs. Fifty-six reviewed test262 cases newly pass,
    covering computed accessor names over identifier, numeric, and string
    literal forms, accessor key evaluation errors, duplicate computed
    accessor keys, an accessor named `constructor` through a computed key,
    setter parameter scope, setter `length` under a default parameter, and
    the class-scope name binding observed from a getter and a setter. One
    new expected negative records the early error for a getter that
    declares a parameter, and
    sixteen cases recorded the static accessor boundary and the
    unresolvable computed key that this profile rejects before execution;
    the static unit below promotes the static accessor cases and keeps the
    unresolvable computed key unsupported. The
    two `grammar-special-prototype-accessor-meth`
    cases stay out of the reviewed subset until
    `Object.prototype.hasOwnProperty` exists.
 -  Class static methods and accessors on the constructor. A `static` element
    carries a placement flag through the owned syntax tree and HIR, and MIR
    lowering targets the constructor value instead of the prototype object
    with the same `property-define-method` and `property-define-accessor`
    operations prototype elements use. Static and prototype elements share
    one source-ordered loop, because ClassDefinitionEvaluation defines every
    element in source order and only chooses a different target for each, so
    a computed static key and a computed prototype key interleave by
    position. A static element therefore reuses the whole prototype-element
    contract: the non-constructible method function kind, so it has no own
    `prototype` property and `new` on it throws a `TypeError`; the `get ` and
    `set ` runtime name prefixes; name inference over identifier, string
    literal, numeric literal, computed, and symbol keys; and writable,
    non-enumerable, configurable placement, so `Object.keys` on the
    constructor is empty. Dynamic `this` inside a static method is the class
    when the method is called through it, and stays `undefined` through a
    detached reference because a class body is strict. Because a static
    element defines an own property of the constructor, it replaces the
    `name` or `length` the class itself installed, while a computed
    `"prototype"` key throws a `TypeError` against the non-writable,
    non-configurable `prototype` property. A literal `constructor` key is
    admitted on a static element and leaves `prototype.constructor`
    untouched, unlike the prototype element the grammar rejects. Deliberate
    boundary: private static methods and accessors are rejected with the
    class element diagnostic. Native
    differential fixtures retain a static method, a static getter and setter
    pair, static `this` through the class and through a detached reference,
    the static method and accessor descriptors and their attributes, static
    `name` and `length` for methods and both accessor halves, static
    non-constructibility, an instance that does not inherit a static member,
    one class defining the same name statically and on the prototype, a
    static member on an anonymous class expression, interleaved computed
    static and prototype key evaluation order, numeric, string literal,
    symbol, and computed static keys, a static element that replaces `name`
    and `length`, the computed `"prototype"` rejection, a static
    `"constructor"` key, last-definition-wins across a static method and
    accessor under one key, a static accessor round trip, and the class-scope
    name binding read from a static method and getter. The generated class
    property suite now places each drawn element on the prototype or on the
    constructor and reads it through the matching owner. Eighty-two reviewed
    test262 cases newly pass, covering the `accessor-name-static` and
    `method-static` families in both class forms, static setter and method
    parameter-body variable scope, static method `length` under a default
    parameter, the computed `"prototype"` `TypeError`, and the eight
    previously unsupported prototype accessor descriptor and `name` cases
    whose classes also define static accessors. Fifteen new expected
    negatives cover static method parameter `yield` and the static class name
    identifier early errors, and the remaining unsupported cases record the
    unresolvable computed accessor key, the static field element name, and
    the `Object` intrinsic the `fn-name` and `fn-length` static-precedence
    order cases require. The reviewed manifest moves to 950 passes, 379 expected
    negatives, and 156 unsupported profile features with no semantic or
    harness failures.
 -  Class inheritance through `extends`, the `super()` call, and
    `new.target`. A class expression carries its `extends` operand as one
    heritage expression that MIR lowers inside the class-scope environment
    before the constructor closure exists, so a heritage operand that reads
    the class name observes its temporal dead zone and a side effect in it
    runs before any element key. A new `class-heritage` runtime entry point
    validates the operand and links both chains at once: the constructor's
    `[[Prototype]]` becomes the parent constructor and the class `prototype`
    object's `[[Prototype]]` becomes `Get(parent, "prototype")`. Static members
    therefore resolve through the constructor chain and instance members
    through the prototype chain, `instanceof` walks the whole chain, and both
    objects stay out of dictionary mode because a class definition allocates
    them itself. An operand that is neither `null` nor a constructor throws a
    `TypeError`, as does a constructor whose `prototype` is a primitive; a
    `null` operand leaves both chains null, which is what an ordinary
    function's `[[Prototype]]` already is in this runtime.
    A derived class constructor owns a `this` binding instead of reading its
    receiver directly. The binding is a fresh uninitialized cell per
    invocation, so reading `this` before `super()` throws a `ReferenceError`
    through the same temporal-dead-zone machinery lexical declarations use,
    and every arrow function nested in the constructor shares that cell and
    therefore observes the receiver `super()` bound even when the arrow was
    created earlier. `super()` reads the running constructor's own
    `[[Prototype]]`, rejects a non-constructor with a `TypeError`, constructs it
    with a fresh receiver allocated from `new.target`'s prototype, and binds
    the result. A second `super()` performs that construction again before
    `BindThisValue` throws a `ReferenceError`, so a parent that publishes its
    receiver exposes two distinct objects and private instance initialization
    does not replace that error with an earlier `TypeError`. Because the
    parent's completion value is what gets bound, a base constructor that
    returns its own object replaces the fresh receiver for the rest of the
    derived constructor. An error
    constructor reached through `super()` takes its instance prototype from
    the same new target rather than from its own `prototype`, so
    `class AppError extends Error {}` produces instances whose prototype is
    `AppError.prototype`; a direct `new Error` supplies itself as the new
    target and is unchanged. A parameter hint never reaches these rules,
    because the addition specialization declines a derived constructor whose
    `return` the `this` binding still has to route. Every `return`
    of a derived constructor leaves through that binding: an object stands as
    written, `undefined` yields the bound `this` and so throws when `super()`
    never ran, and any other value is a `TypeError`. MIR rewrites the
    terminators after the body is built, so a `return` inside `try` still runs
    its `finally`, including a `finally` that calls `super()`. A class body
    without a `constructor` gets the implicit
    `constructor(...args) { super(...args); }` with a synthetic rest parameter
    name and a `length` of zero. `new.target` is admitted as its own
    expression that reads the construction target the call ABI already
    carries: it is the constructed class through every `super()` hop, and
    `undefined` for an ordinary call, a method call, a generator body, and an
    asynchronous function, none of which are constructors.
    An arrow captures the enclosing function's `super()` constructor context
    and `new.target` alongside its lexical receiver. Nested arrows retain that
    context, while an intervening ordinary function starts its own. Native
    differential fixtures cover a two-level and a three-level chain, an
    inherited method,
    accessor, and static member, a derived class with no constructor, a
    derived class expression both named and anonymous, a class extending an
    ordinary function, derived `name` and `length`, the `prototype` descriptor
    and empty own keys of a derived class, `this` read before `super()`, a
    missing `super()`, a double `super()`, a derived constructor returning a
    number, `undefined`, and an object, a base constructor that returns its
    own object, `super()` in both branches of a conditional, a `return` inside
    `try` whose `finally` calls `super()`, an arrow created before `super()`,
    an ordinary nested function keeping its own `undefined` receiver, a rest
    parameter forwarded through `super()`, calling a derived class without
    `new`, heritage and computed-key evaluation order, a class extending
    itself, every rejected operand form, `extends null` with and without an
    explicit constructor, a parent whose `prototype` is `null`, a heritage
    operand read through a getter, per-call derived class identity from a
    factory, `new.target` in an ordinary function, a class constructor, a
    method, a static method, a three-level derived chain, a generator, and an
    asynchronous function, a hinted and an unhinted derived constructor
    returning a sum, and an `Error` and a `TypeError` subclass including a
    two-level chain and a subclass that adds its own state after `super()`.
    The generated class property suite now draws each
    class standing alone, extending a base class through a declared `super()`
    call, or extending it through the implicit derived constructor, and models
    the inherited field, prototype method, and static member. Sixty-six
    reviewed test262 cases newly pass, covering the `subclass` default and
    derived-return-override families, `super()` argument and spread
    evaluation, `BindThisValue` and its second-call rejection, the `super()`
    expression value, heritage identifier references, heritage class-scope
    lexical open observations, a rejected arrow, asynchronous, and accessor
    heritage, a parent `prototype` setter, a static method override,
    `extends null` prototype wiring, and the `new.target` value through calls,
    member expressions, `new`, and `super()`. Three new expected negatives
    record the escaped `new.target` early errors and the module-goal
    `new.target` early error the added feature tag now reaches. Seventeen new
    unsupported cases originally recorded `super()` from an arrow function,
    `super.property`, and the `Reflect`, tagged template,
    `Function.prototype.bind`, typed-array, and `Object` intrinsics that other
    inheritance cases need. Unit 6.6 promotes the lexical arrow cases, and the
    tagged-template case from that set now passes.
    The two `definition/prototype-getter` and
    `definition/prototype-setter` cases leave the reviewed subset until
    `Function.prototype.bind` exists, because the heritage they build starts
    from a bound function. The reviewed manifest moves to 1016 passes, 382
    expected negatives, and 169 unsupported profile features with no semantic
    or harness failures.
 -  `super` property references inside a class body with `extends`. A class
    definition records each element's home object: the class `prototype`
    object for an instance element and the constructor itself for a `static`
    one, which are the two objects `class-heritage` already links. A
    reference reads the `[[Prototype]]` of the home object its running function
    carries, so an instance reference starts at the parent's `prototype` and a
    static one at the parent constructor, and both keep the enclosing
    element's `this` as the receiver. `super.x`, `super[expr]`, and
    `super.m()` therefore reach a definition an override shadows while a
    getter or method still runs against the derived instance. A read shares
    the ordinary property inline cache, guarded on the object the lookup
    starts at, so a data property the parent prototype owns hits the cached
    slot while an inherited property and an accessor take the generic lookup;
    the fast path never observes the receiver, because the cache refuses
    accessor slots. An assignment is `Set` with a distinct receiver: a setter
    found on the base chain runs against `this`, and an assignment that
    reaches no setter creates or updates an own property of `this` instead,
    without consulting an accessor that only the receiver's own chain would
    find. A read-only property on either side reports a `TypeError`, because
    a class body is strict. A computed reference reads its receiver before
    its key, so `super[key()]` inside a derived constructor throws the
    `ReferenceError` for an uninitialized `this` before `key` runs, and
    reads the home object's `[[Prototype]]` after that key, so a key
    expression that replaces the prototype is observed by the very
    reference it precedes. A home
    object whose `[[Prototype]]` is null, as `extends null` leaves it, reports
    the `TypeError` the read or write itself raises.
    Arrows capture the enclosing class element's home object, and asynchronous
    class elements carry it through their synthesized execution function. An
    optional call such as `super.m?.()` guards the looked-up value and calls a
    present method with the same derived receiver. Deliberate boundaries: a
    `super` property reference is rejected with a source-located diagnostic in
    a class body without `extends` and in an object literal method, because
    this runtime has no `Object.prototype` object for such a lookup to reach,
    and as the operand of `delete`, a destructuring assignment target, or a
    `for` head, which name a target this lowering does not carry a receiver
    through. Native differential
    fixtures cover a read, a method call, and a detached method value through
    a two-level and a three-level chain, an override reached from the parent
    through the derived receiver, an accessor read and its receiver, a write
    that reaches a parent setter, a write that shadows a receiver accessor
    without running it, a write that creates an own data property and its
    descriptor, a compound assignment and both update forms reading the
    parent and writing the receiver, a write to a read-only parent property,
    computed references over a string, symbol, and index key, computed-key
    evaluation order against the `this` temporal dead zone, a reference
    inside a derived constructor before and after `super()`, static method,
    getter, and setter references through the constructor chain, a nested
    class taking its own home object, and cached, inherited, and accessor
    reads with their guard hit and miss counts. The generated class property
    suite now draws a reading body that returns a base member reached through
    `super` and a setter clause that stores through `super`, on the prototype
    and on the constructor. Unit 6.6 adds a directly generated lexical-arrow
    domain, and Unit 8.2 adds a separate present-and-absent optional-call
    domain without changing that reviewed property.
    Eighteen reviewed test262 cases newly pass:
    fifteen newly reviewed cases covering the `prop-dot` and `prop-expr`
    value, receiver, null-prototype, and uninitialized-`this` families and
    the `super` in-method, in-accessor, and static in-accessor cases, and
    three that leave the unsupported list, including the three-level
    `prop-dot-cls-val` chain and the `new.target` value read through a
    `super` property. Thirty-three new unsupported cases originally record
    this unit's boundaries: an object literal `super`, a class body without
    `extends`, an arrow, and `eval`, together with the `Object.freeze`,
    `Object.setPrototypeOf` ordering, `Object` heritage, and `Test262Error`
    observations the remaining cases need. Unit 6.6 later promotes the arrow
    cases. The reviewed manifest moves to
    1034 passes, 382 expected negatives, and 199 unsupported profile features
    with no semantic or harness failures.
 -  Public instance class fields. A `field = expression` element records the
    key its class body evaluates once and a closure that produces the value
    once per instance, in class-body order, on the constructor itself. That
    pair is ECMA-262's `[[Fields]]`, and the constructor runs it as
    InitializeInstanceElements: a base constructor before its body, which is
    where `[[Construct]]` performs it and therefore before a parameter default
    can observe the instance, and a derived constructor where `super()`
    returns, so a base constructor never observes a derived field and a
    second `super()` is rejected before it can initialize them again. A field
    declared without an initializer takes `undefined`. Each field becomes an
    own writable, enumerable, configurable data property through
    CreateDataProperty, so it is defined rather than assigned: an inherited
    setter never runs, a non-writable inherited property does not reject it,
    and a field shadows a prototype method of the same name. The initializer
    is its own function body, not part of the constructor: it reads the class
    scope rather than the constructor's parameters, provides the receiver an
    arrow function nested in it captures, sees `undefined` for `new.target`,
    and carries the class prototype as its home object, so `super.x` in it
    starts at the parent's prototype with the instance as the receiver.
    NamedEvaluation names an anonymous initializer from the field key,
    including a computed key, which travels to the closure through a cell the
    class body fills with the one key evaluation it performs. A key follows
    ToPropertyKey, so a numeric, string literal, computed, or symbol key
    behaves as it does elsewhere. Deliberate boundaries: a field named
    `constructor` and the TypeScript `declare`, `readonly`, `definite`, and
    optional field modifiers are rejected with source-located diagnostics.
    Native differential fixtures cover a field with and without an initializer,
    an initializer reading an earlier field, the own-property descriptor,
    per-instance copies, the absent prototype property, a field the constructor
    body observes, an inherited setter that does not run, a non-writable
    inherited property, a shadowed prototype method, interleaved key and
    initializer evaluation order across methods and static elements, an abrupt
    key and an abrupt initializer, base and derived ordering, the implicit
    derived constructor, `super()` in both branches of a conditional, a
    replaced derived result, a rejected second `super()`, parameter defaults
    reading a field, the class scope against a constructor parameter of the
    same name, an anonymous class expression, an arrow initializer and a nested
    arrow, name inference over every admitted key form, per-evaluation naming
    from a factory, ToPropertyKey coercion, `super` calls and accessor reads in
    initializers across a two-level and a three-level chain, a nested class
    taking its own home object, and a hinted constructor whose addition
    specialization keeps its fields on every guard path. The generated class
    property suite now draws each element as a field with an initializer,
    without one, or with an anonymous function the key names, and models the
    instance's own key order and the initializer markers. Forty-three reviewed
    test262 cases newly pass, covering the `fields-asi`, `grammar-field`,
    `regular-definitions`, and `wrapped-in-sc` field grammar families, computed
    key `ToPrimitive` errors, incremental key and initializer evaluation,
    `static` as an instance field name, the constructor called after fields, an
    abrupt initializer, a `super` initializer's abrupt completion, the `this`
    temporal dead zone observed from an initializer, and a base-class setter a
    field definition bypasses. Seventy-eight new expected negatives record the
    `arguments` and `super()` early errors an initializer reports across every
    key form, the automatic-semicolon-insertion rejections, and the
    `constructor`, `static prototype`, and `static constructor` field name
    early errors. Twenty-eight new unsupported cases record this unit's
    boundaries and the `eval`, `Object`, `Proxy`, unresolvable computed key,
    and generator-method observations the remaining cases need. The three
    `init-value-defined-after-class` and
    `fields-computed-name-propname-constructor` cases stay out of the reviewed
    subset until `Object.prototype.hasOwnProperty` exists. The reviewed
    manifest moves to 1077 passes, 460 expected negatives, and 227 unsupported
    profile features with no semantic or harness failures.
 -  Private instance class elements. A `#name` field, a `#name()` method, and
    a `get #name` or `set #name` accessor declare a private name that the
    class body owns rather than a property key. A private element is not a
    property: no key observation reaches it, so `Object.keys`, property
    enumeration, and descriptor reads on an instance or its prototype stay
    exactly as they were before the element was declared, and the name is
    unforgeable from outside the class body. Each evaluation of a class
    creates its private names afresh, so two instances produced by two
    evaluations of one class expression never satisfy each other's elements,
    and a derived class that spells a name its base also spells declares its
    own rather than reaching the base's. Reading or writing a private element
    on an object that does not carry the declaring class's brand throws a
    `TypeError`, which is what a detached method, a plain object, a receiver
    that never ran the constructor, and the class prototype itself all
    observe. Private methods and accessors are installed before any field
    initializer runs, matching InitializeInstanceElements, so an initializer
    reaches a method its class declares later in the body. A private method
    is not writable, so assigning to one from class-body code throws a
    `TypeError`, and it is the same non-constructible method kind prototype
    methods use, so `new` on a retrieved one throws and it carries the class
    prototype as its home object, which lets `super.x` inside it start at the
    parent's prototype. A private accessor pairs a getter and a setter under
    one name into one element, so a getter-only element rejects a write. A
    derived constructor installs its private elements where `super()`
    returns, so a private read before `super()` reports the `this` binding's
    temporal dead zone `ReferenceError` rather than a brand `TypeError`.
    Compound assignment and the prefix and postfix update operators read the
    element once and write it once through the same private name. A private
    reference may use another object as its base and performs the same
    private-name lookup and brand check that a `this.#name` reference performs.
    Deliberate boundaries: `#name in object`, optional `?.#name` access, and a
    private reference used as a destructuring or `for-of` assignment target
    are rejected with source-located diagnostics, and `delete this.#name` is
    reported as the early error it is. Native
    differential fixtures cover private fields and their absence from every key
    observation, private methods including installation order, non-
    writability, non-constructibility, and the home object, private accessors,
    brand checks across per-evaluation identity, plain objects, uninitialized
    receivers, the prototype receiver, and a base that lacks a derived name,
    the pre-`super()` temporal dead zone, compound assignment and update
    operators, private state holding every admitted value, and a hinted method
    that specializes while private fields, a private method, and a private
    accessor surround it, with every guard path leaving those elements intact.
    Eighty-four reviewed test262 cases newly pass and three hundred sixty-six
    new expected negatives record the private name early errors, which are
    dominated by the undeclared-private-name references every class element
    form reports. Seventy new unsupported cases record this unit's boundaries.
    The reviewed manifest moves to 1,161 passes, 826 expected negatives, and
    297 unsupported profile features with no semantic or harness failures.
 -  Static class fields, public and private. A `static field = expression`
    and a `static #field = expression` element carry the same placement flag
    a static method already carries through the owned syntax tree and HIR,
    and reuse the whole field pipeline; only the destination changes. An
    instance field records the key and the initializer closure on the
    constructor for each instance to replay, while a static field's
    definition is performed once, against the constructor, by the class
    definition itself. The class body still evaluates every element's key and
    creates every initializer closure in one source-ordered loop, so a
    computed static key and a computed instance key interleave by position.
    The static initializers then run after that loop and after the
    class-scope binding is initialized, which is ECMA-262's staticElements
    step, so a static initializer reaches a method declared later in the
    body, reads the class through its own name rather than in a temporal dead
    zone, and completes before any instance exists. A public static field
    becomes an own writable, enumerable, configurable data property of the
    constructor through CreateDataProperty, so it appears in `Object.keys` on
    the class in definition order and replaces the configurable `name` and
    `length` the class installed rather than assigning through them. A
    private static field becomes a private element the constructor itself
    carries, so no key observation, enumeration, or descriptor read reaches
    it and an instance of the declaring class fails its brand check exactly
    as an unrelated object does. The initializer takes the constructor as its
    receiver and carries it as its home object, so `this` is the class, a
    nested arrow captures the class, and `super.x` starts at the parent
    constructor. A derived class's static fields always run after its
    parent's, because the parent's class definition completes first. A class
    whose only elements are static declares no instance elements, so its
    constructor runs no instance element initialization at all. Static private
    methods and accessors are installed on the constructor, and a `C.#name`
    reference uses that constructor as the brand-checked base. Static accessor
    halves merge under one private name just as instance accessor halves do. A
    static field named `constructor` or `prototype` stays the early error it
    is.
    Native differential fixtures cover the own-property descriptor, a field
    without an initializer, the receiver and a nested arrow, replaced `name`
    and `length`, later assignment and deletion, subclass inheritance and
    redeclaration, interleaved key and initializer order across instance and
    static elements, an abrupt static initializer and an abrupt static key,
    NamedEvaluation over every admitted static key form, static private
    reads, writes, updates, and brand failures across evaluations,
    subclasses, and instances, a static private field holding a function,
    `super` reads over a two-level and a three-level chain, and a hinted
    method that specializes while static elements surround it on every guard
    path. Forty-two reviewed test262 cases newly pass, forty-five new
    expected negatives record the `arguments` and `super` static initializer
    early errors, and sixty-eight new unsupported cases record boundaries later
    units own. The reviewed subset gains the
    `class-static-fields-public` and `class-static-fields-private` feature
    tags; the remaining cases those tags reach need `String`, further
    `Object` members, `eval`, `Proxy`, `Function`, or generator and asynchronous
    methods, and stay outside the reviewed subset until the units that own them
    land. The reviewed manifest moves to 1,203
    passes, 871 expected negatives, and 365 unsupported profile features with
    no semantic or harness failures.
 -  Class static initialization blocks. A `static { ... }` element declares
    nothing and evaluates no key: it is a statement list the class definition
    runs once. The frontend converts the block to a parameterless function
    body with the same element function kind a method has, so it owns `var`
    hoisting, block-level declarations, and the strictness a class body
    already established, and each block is a separate body whose bindings no
    other element and no enclosing scope reaches. Lowering creates that
    closure where the block appears, binds the constructor as its home
    object, and calls it with the constructor as its receiver once the class
    is otherwise complete, which is EvaluateStaticBlock. The call is an
    ordinary call, so the unit adds no runtime entry point of its own. Blocks
    and `static` field initializers share one deferred, source-ordered list,
    which is ECMA-262's staticElements step: a block and a static field
    interleave by position, both run after every key and every method and
    after the class-scope binding is initialized, and an abrupt block stops
    the class definition where it threw. `this` is the constructor, so a
    nested arrow captures the class, an ordinary nested function keeps its
    own strict receiver, `new.target` is `undefined`, and `super.x` starts at
    the parent constructor in a derived class. A block reaches the static
    private elements its class declares through that receiver, and a class
    whose only element is a block declares no instance element. `arguments`,
    `return`, `super()`, `await`, `yield`, and an unlabeled `break` or
    `continue` inside a block stay the early errors they are. Native
    differential fixtures cover a lone block and its own-property
    observation, several blocks in source order, the receiver and a nested
    arrow, the class-scope name binding and a method declared later, an
    anonymous class expression named before its blocks run, interleaving with
    static fields and computed keys, an abrupt block in a class expression
    and in a class declaration, per-block `var`, `let`, `const`, and function
    declarations, static private access, per-evaluation identity, a nested
    class inside a block, loops and `try` inside a block, `super` reads over
    a two-level chain, parent-before-child definition order, and a hinted
    method that specializes while blocks surround it on every guard path. The
    generated class property suite now draws a static block alongside the
    other elements. Twenty-seven reviewed test262 cases newly pass,
    twenty-seven new expected negatives record the `await`, `arguments`,
    `return`, `super()`, `yield`, and unlabeled control-flow early errors,
    and eight new unsupported cases record the boundaries this unit keeps. The
    reviewed subset gains the `class-static-block` feature tag; the one
    remaining case that tag reaches inside the admitted syntax,
    *static-init-sequence.js*, stays outside the reviewed subset pending
    separate review. The same interleaving remains covered by a native
    fixture; Unit 7.4's later narrow `%Array.prototype.push%` dependency does
    not reclassify this class case. The reviewed manifest moves to 1,230
    passes, 898 expected negatives, and 373 unsupported profile features with
    no semantic or harness failures.
 -  The asynchronous iterator protocol and the `for await (... of ...)`
    statement. `GetIterator(value, async)` reads the value's
    `Symbol.asyncIterator` method, calls it, and captures the resulting
    iterator's `next` method once, throwing a catchable `TypeError` for a
    non-object value, a non-callable method, or a non-object iterator. A
    value with no such method falls back to `GetIterator(value, sync)` and
    wraps that record, which is CreateAsyncFromSyncIterator; the wrapper is a
    runtime-internal record with no prototype and no properties, because
    nothing outside the loop reaches it. Each step calls the captured `next`
    method and awaits its result, requires an object, and reads `done` and
    `value`, while a wrapped synchronous iterator instead awaits the stepped
    value, so a synchronous iterable of promises yields settled values and a
    rejected value rejects the step, and the head then awaits the promise the
    wrapper method settles. Every wrapper path reaches that outer await,
    including the abrupt ones that reject the same promise rather than
    throwing to the head, so a fallback step interleaves with queued jobs
    exactly where a reference host places it.
    `AsyncIteratorClose` awaits the `return`
    method's result and requires an object; the wrapper instead requires the
    synchronous result to be an object and then reads and awaits its `done`
    and `value`, and both happen before completion precedence applies, so an
    in-flight body error still observes those getters. The reviewed
    *test/built-ins/AsyncFromSyncIteratorPrototype/* cases pin that wrapper
    directly: thirty-one pass, four are unsupported, and three stay outside
    the reviewed subset, all of them poisoned-wrapper cases belonging to the
    `PromiseResolve` gap below. The *throw/iterator-result.js* case entered
    as a pass once M5a Unit 8.4, recorded below, repaired the throw
    forwarded through the wrapper to a synchronous generator.
    The head reuses the synchronous
    `for-of` lowering unchanged, so it admits the same `const`, `let`, `var`,
    existing binding, member target, and array or object pattern forms with
    the same temporal dead zones, fresh per-iteration cells, `var` hoisting,
    and nested cleanup, and `break`, `continue`, `return`, labeled transfers,
    and body throws close the iterator with the same completion precedence:
    a close failure replaces `break` or `return`, an in-flight throw stays
    authoritative, and `continue` keeps the iterator open. Destructuring the
    awaited value is ordinary array or object binding over that value, so it
    acquires its own synchronous iterator. `for await` is admitted only where
    the bootstrap parser already allows it, inside an asynchronous function
    body and at module top level. An awaited iterable expression in the head
    uses the owning traced suspension frame, including the private module frame
    at top level. Native differential
    fixtures cover the synchronous fallback,
    generator and user iterables, `Symbol.asyncIterator` preference over
    `Symbol.iterator`, promised and direct step results, `done` and `value`
    accessor order, timer-driven steps, the turns a wrapped step and a
    wrapped close each spend against previously queued reactions,
    every head form, closures over
    per-iteration cells, the head's dead zone, `break`, `continue`, labeled
    transfers, `return`, body throws, absent, promised, and throwing `return`
    methods, nested and `finally`-wrapped loops, and every catchable
    `TypeError` the protocol defines. A generated property with seed
    `0x5eed0011` draws asynchronous and synchronous iterator kinds, head
    forms, transfer positions, and close modes under both specialization
    policies and forced collection. Two hundred eighty-one reviewed test262
    cases newly pass, ninety new expected negatives record the head's early
    errors, and eight new unsupported cases record the asynchronous generator
    boundary this unit keeps. The reviewed subset gains the `async-iteration`
    and `Symbol.asyncIterator` feature tags, and the manifest moves to 1,511
    passes, 988 expected negatives, and 381 unsupported profile features with
    no semantic or harness failures. Deliberate boundaries: asynchronous
    generators stay rejected, so the asynchronous generator cases the
    `async-iteration` tag reaches stay outside the reviewed subset, and a
    `for await` head over a string still fails, because primitive iteration
    is unsupported. Inside an ordinary asynchronous function or asynchronous
    generator, each iterator step now starts a promise-producing runtime
    operation, saves that promise and its result mode in the owning traced
    frame, and returns to the caller. A fulfillment resumes the frame before
    `done` and `value` are inspected; a rejection resumes it with a throw
    completion. A promise that never settles therefore leaves the function
    pending instead of producing `OSEO3001`. A framed
    `AsyncIteratorClose` now starts a promise-producing operation, retains the
    promise and saved completion mode in traced roots, and restores that
    completion only after its reaction resumes generated code. A close
    promise that never settles therefore also leaves the enclosing operation
    pending. Module top-level `for await` now uses the same return-to-caller
    step and close behavior through its private traced module continuation.
    Top-level await uses that continuation in ordinary expression and
    control-flow positions, while pattern-position await remains rejected.
    Asynchronous source-module cycles are admitted through their SCC order: an
    evaluator waits for earlier members, ignores its DFS back edge, and an
    external dependency waits for the cycle root. Canonical identity, one
    evaluation, live cells, independent sibling progress, FIFO promise jobs,
    and deterministic no-progress shutdown remain unchanged. The generated
    property suite uses seed `0x5eed0021` over structured asynchronous SCC,
    non-root observer, and sibling schedules with an independent oracle, eight
    ordinary cases, replay metadata, and forced collection under both
    specialization policies. Fixed native fixtures cover spread-prefix
    retention, fulfillment, rejection, never settlement, abrupt close
    precedence, a false hint and deliberate generic fallback, canonical
    aliases, and live cycle cells. The reviewed
    *module-import-resolution.js* case moves to pass, producing 2,359 passes,
    1,128 expected negatives, and 519 unsupported profile features among 4,006
    reviewed cases. Static WebAssembly imports retain the separate
    host-integration boundary in [*PLAN-WASM.md*](../PLAN-WASM.md).
 -  Asynchronous generator functions. `async function*` declarations and
    function expressions are admitted, and calling one runs its parameter and
    environment prologue and returns a suspended asynchronous generator whose
    `[[Prototype]]` is the function's own `prototype` object. That object
    inherits from a lazily created `%AsyncGeneratorPrototype%`, which serves
    virtualized `next`, `return`, `throw`, and `Symbol.asyncIterator` methods,
    so a generator is its own asynchronous iterable and a `for await` head
    consumes it through the ordinary protocol. An asynchronous generator
    function is not constructible and carries no `constructor` on its
    `prototype` object.
    An asynchronous generator body reuses the generator suspension record: it
    suspends at `await` as well as at `yield`, so `await` is admitted in
    ordinary expression positions inside such a body rather than only in the
    M4 continuation positions. M5a Unit 8.3 extends that admission to the
    pattern subexpressions of such a body: `await` inside a computed member of
    an assignment target, a computed binding property name, or an array or
    object binding default suspends the same record, as recorded below.
    `next`, `return`, and `throw` each enqueue one
    AsyncGeneratorRequest and return its promise immediately; the queue's head
    owns the running step, so a call that arrives while the body runs or
    awaits waits its turn instead of reaching a running body, and every step
    reports through the promise its own call returned. A suspension on `await`
    installs reactions on the operand and returns to the caller, so a fulfilled
    operand resumes the body with its value and a rejected one raises a throw
    completion at the await position, which every enclosing `catch`,
    `finally`, and iterator close still observes. A body that completes
    normally reports `{ value, done: true }`, and one that throws rejects the
    step's promise and completes the generator.
    `yield` awaits its operand before the step reports it, so a yielded
    promise reaches the consumer as its settled value, and `return expr`
    awaits its operand for the same reason while a bare `return` awaits
    nothing. A `return` resumption awaits the value it delivers before the
    body leaves through the return completion, and a `return` or `throw` that
    reaches a generator suspended at its start or already completed completes
    it without entering the body: `return` awaits and reports its value,
    `throw` rejects, and a later `next` reports `{ undefined, true }`.
    `yield*` acquires the operand's asynchronous iterator, falling back to the
    wrapped synchronous protocol, and forwards every resumption to it. Each
    step awaits the inner result, requires an object, and reports
    `IteratorValue` rather than the inner result object, because the outer
    step is an AsyncGeneratorYield and that step awaits nothing; a promise the
    delegated iterator produced therefore reaches the consumer unchanged. A
    return resumption steps the inner `return` and a throw resumption steps
    the inner `throw`; either method reporting a done result ends the
    delegation, a return ending it leaves the body through the return
    completion, and a throw ending it completes the delegating expression with
    the reported value. An inner iterator with no `throw` method is closed and
    the delegation reports a catchable `TypeError`.
    Default and recursive binding-pattern parameters use the ordinary
    synchronous parameter machinery before the asynchronous generator object
    is returned, so their initialization cannot be deferred until a queued
    request resumes the body. Asynchronous generator method definitions are
    admitted in object literals and prototype, static, and private class
    elements. Each `yield*` next, return, and throw step starts through a
    promise-producing runtime entry point and suspends the generator's owned
    traced frame. The request method returns to its caller before settlement,
    and the frame inspects the result only after its reaction resumes. The
    missing-`throw` path for a native asynchronous iterator performs
    `AsyncIteratorClose` through the generator's traced frame, so its request
    promise returns before the close settles and remains pending when the
    close promise never settles.
    Native differential fixtures cover single and repeated yields, sent
    values, awaited and promised operands, an empty body, an awaited explicit
    return, function `length`, `name`, and inferred `name`, self-iterability
    through `Symbol.asyncIterator`, the absent `Symbol.iterator`, a shared
    method identity across two generators, the `prototype` object's own
    property set with no `constructor`, `in` agreeing with a property read on
    the virtualized `next`, `return`, `throw`, and `Symbol.asyncIterator`,
    non-constructibility, `throw` into
    `try`/`catch`, `return` through `finally` including a `finally` that
    awaits and one that yields, unstarted `return` and `throw`, delegation to
    arrays, synchronous generators, asynchronous generators, nested
    delegations, and a hand-written asynchronous iterator whose `return` and
    `throw` are forwarded, the missing-`throw` `TypeError`, rejected awaits
    caught and uncaught, body throws, timer-driven awaits, queued requests
    resolved in order, a misapplied method that rejects rather than throws,
    and the exact microtask interleaving of two generators against five
    chained reactions. A generated property with seed `0x5eed0018` draws
    bounded bodies, awaited and promised operands, three delegation kinds,
    `try`/`catch` and `try`/`finally` guards, and every resumption position
    under both specialization policies and forced collection.
    Unit 7.5 adds fixed reaction- and timer-ordered delegation fixtures plus a
    generated property with seed `0x5eed001e`. The property draws `for await`
    in ordinary asynchronous functions and asynchronous generators, plus
    `yield*`, native asynchronous and wrapped synchronous iterators, reaction,
    timer, and never-settling results, and truthful and false hints. Its
    independent schedule model is compared with Node.js, Deno, both native
    specialization policies, and forced collection. Fixed native evidence
    also delivers a return resumption while an asynchronous generator is
    suspended at a `yield` inside its still-open `for await` loop. The reviewed
    *yield-star-return-then-getter-ticks.js* case enters the test262 subset as
    a pass, moving the manifest to 4,000 cases: 2,352 passes, 1,128 expected
    negatives, and 520 unsupported profile features with no semantic or
    harness failures.
    Unit 7.6 adds fixed reaction-, timer-, rejection-, non-object, and
    never-settling close fixtures for abrupt `for await` completion and
    missing-`throw` delegation, plus synchronous stepped-value rejection
    fixtures that require the wrapped iterator to close without replacing the
    original rejection. Wrapped synchronous missing-`throw` delegation closes
    the underlying iterator synchronously without reading or awaiting the
    close result's fields.
    Generated properties with seeds `0x5eed001f` and `0x5eed0020` draw
    structured close-frame and AsyncFromSync rejection domains against
    independent completion models, Node.js, Deno, both specialization
    policies, false hints, deliberate generic fallback, and forced
    collection. Five reviewed *AsyncFromSyncIteratorPrototype* cases and
    *iterator-close-non-throw-get-method-is-null.js* enter as passes, moving
    the manifest to 4,006 cases: 2,358 passes, 1,128 expected negatives, and
    520 unsupported profile features with no semantic or harness failures.
 -  The asynchronous generator intrinsic chain. `%AsyncIteratorPrototype%`,
    `%AsyncGeneratorPrototype%`, `%AsyncGeneratorFunction.prototype%`, and
    `%AsyncGeneratorFunction%` are materialized as one lazily created
    cluster, because their `constructor` and `prototype` links are circular.
    An asynchronous generator reaches its function's own `prototype` object,
    that object inherits from `%AsyncGeneratorPrototype%`, and
    `%AsyncGeneratorPrototype%` inherits from `%AsyncIteratorPrototype%`.
    `next`, `return`, and `throw` are own properties of
    `%AsyncGeneratorPrototype%` and `Symbol.asyncIterator` is an own property
    of `%AsyncIteratorPrototype%`, each writable, non-enumerable, and
    configurable, so a descriptor read, a deletion, and an assignment all
    observe the same set a property read does, and a replaced `prototype`
    object reaches exactly the methods its own chain still retains.
    `%AsyncGeneratorPrototype%` carries own `constructor` and
    `Symbol.toStringTag` properties, valued
    `%AsyncGeneratorFunction.prototype%` and `"AsyncGenerator"`, and
    `%AsyncGeneratorFunction.prototype%` carries own `constructor`,
    `prototype`, and `Symbol.toStringTag` properties, valued
    `%AsyncGeneratorFunction%`, `%AsyncGeneratorPrototype%`, and
    `"AsyncGeneratorFunction"`. Each is non-writable, non-enumerable, and
    configurable, as the specification requires.
    `%AsyncGeneratorFunction%` has `name` `"AsyncGeneratorFunction"`,
    `length` 1, and a non-writable, non-configurable `prototype`, and every
    asynchronous generator function has it as its `constructor` because
    `%AsyncGeneratorFunction.prototype%` is that function's `[[Prototype]]`.
    Deliberate boundaries: three of the cluster's `[[Prototype]]` links are
    null because this profile materializes neither `%Object.prototype%` nor
    the `Function` intrinsics. `%AsyncIteratorPrototype%` should inherit
    from `%Object.prototype%`, `%AsyncGeneratorFunction.prototype%` from
    `%Function.prototype%`, and `%AsyncGeneratorFunction%` from
    `%Function%`. Calling or constructing `%AsyncGeneratorFunction%` reports
    the `OSEO1001` dynamic-source diagnostic of
    [ADR 0016](./adr/0016-dynamic-source-boundary.md) instead of compiling
    source text. The reviewed
    *test/built-ins/AsyncGeneratorPrototype/* and
    *test/built-ins/AsyncIteratorPrototype/* cases that observe these values
    reach them through `Object.getPrototypeOf`, which is not admitted, so
    none of them promote yet and the gap entry below owns that.
    Native differential fixtures cover both intrinsic identities shared
    across two generator functions, the four `constructor` and `prototype`
    links, `%AsyncGeneratorFunction%`'s `name` and `length`, both
    `Symbol.toStringTag` values as read through a generator and through its
    function's `prototype` object, `in` agreeing with a property read across
    the whole chain, every own property descriptor including the four methods
    and the link each sits at, deleting a configurable method, the empty
    enumerable key sets, the shared method identities and their `length` and
    `name` values, a borrowed `Symbol.asyncIterator` returning an ordinary
    receiver, the `%AsyncGeneratorPrototype%` fallback a non-object `prototype`
    produces, a replaced `prototype` object that reaches only its own `next`,
    and each of `next`, `return`, and `throw` rejecting rather than throwing
    for a non-generator receiver, including the intrinsic prototype itself.

### BigInt primitive and operators

M5a Unit 8.1a admits exact decimal, binary, octal, and hexadecimal BigInt
literals, including the candidate edition's numeric separators. The Babel
adapter converts the source spelling directly to separator-free owned radix
digits. Syntax, HIR, MIR, and generated C never route a BigInt constant through
`Number` or `double`.

Every BigInt is a primitive stored as a managed `OSEO_HEAP_BIGINT` with one
normalized sign and magnitude. The inline magnitude uses little-endian 30-bit
limbs in `uint32_t` storage and `uint64_t` arithmetic intermediates. Zero is
never negative, equality compares mathematical values, and the collector marks
the object without tracing its non-value limbs. Tag 7 remains unassigned.
[ADR 0023](./adr/0023-bigint-representation.md) records the representation and
replacement triggers.

`typeof` reports `"bigint"`; Boolean conversion is false only for `0n`; string,
template, property-key, strict equality, loose equality, and relational
operations use the exact primitive value. Cross-type relational and loose
comparisons do not round the BigInt through binary64.

The shared `ToNumeric` dispatch preserves a BigInt result from primitive
conversion and otherwise continues through `ToNumber`. Arithmetic requires
matching numeric types after left-to-right conversion. Mixing a Number and a
BigInt throws a catchable `TypeError`. Addition, subtraction, multiplication,
division, remainder, exponentiation, bitwise AND, OR, XOR and NOT, signed left
and right shifts, unary negation, compound assignment, and prefix and postfix
update are exact. Division truncates toward zero. Division or remainder by
zero and a negative exponent throw `RangeError`; unary plus and unsigned right
shift throw `TypeError` for BigInt operands.

The portable baseline limits a BigInt magnitude to 65,536 bits. An operation
that would exceed that reviewed resource ceiling throws a catchable
`RangeError` before allocating the oversized result. Allocation or host
resource failure below the ceiling remains a non-catchable runtime diagnostic.

Assignment and update reuse the existing reference lowering. Identifier and
member targets retain their read, right-operand, conversion, second property-key
conversion, write, and abrupt-completion order. Update first performs
`ToNumeric`, selects `1n` or `1` from that numeric type, and preserves prefix or
postfix result selection. False `number` hints still enter the compiled generic
fallback after a deliberate guard miss.

M5a Unit 8.1a advances the runtime ABI to `m5-35`. It adds
*runtime\_bigint.c*, exact literal
construction, `ToNumeric`, and numeric-one entry points. Fixed
native evidence compares Node.js, Deno, both specialization policies, forced
collection, Linux AMD64 execution, and the AArch64 Linux cross-link. The
generated property suite uses ordinary seed `0x5eed0022`, a 10-case ordinary
budget, directly generated admitted operator domains, and a bounded independent
integer oracle. The repository extended gate uses fixed seed `0x5eed0003` and a
ten-times scale for a 100-case budget. Both native policies force collection.

The reviewed Test262 manifest adds 168 pinned BigInt cases without changing the
suite revision, inventory policy, schema, or classification vocabulary.
Eighty-nine cases pass, 39 are expected syntax negatives, and 40 remain honestly
unsupported because they also require an unimplemented intrinsic or object
boundary. The complete manifest moves from 4,006 to 4,174 cases, 2,359 to 2,448
passes, 1,128 to 1,167 expected negatives, and 519 to 559 unsupported profile
features, with no semantic or harness failures.

The callable `BigInt` intrinsic, `BigInt.prototype`, wrappers, constructor
behavior, `BigInt.asIntN`, and `BigInt.asUintN` remain outside this M5a unit.
They remain M5b work under [*PLAN-BIGINT.md*](../PLAN-BIGINT.md). Binary-data
and atomic consumers also remain with their owning built-in families.

### Delete expressions

M5a Unit 8.1b admits the remaining core `delete` operands without changing the
ordinary property-reference runtime operation. Owned syntax retains a general
operand until HIR resolution distinguishes declarative, unresolvable, dynamic
`with`, non-reference, and optional-chain cases. MIR uses constants for static
identifier results, evaluates and discards non-reference values only after
their abrupt checks, and branches optional deletion to `true` without entering
the skipped reference spine. A live optional path reuses the ordinary property
delete operation for its final member.

Fixed differential fixtures compare Node.js, Deno, specialization disabled and
enabled, forced collection, Linux AMD64 execution, and the AArch64 Linux
cross-link. They retain strict and non-strict behavior, resolved and unresolved
names, temporal-dead-zone independence, `with` selection, operand, key,
conversion, and call order, abrupt completion, nullish short-circuiting, later
chain suppression, live static and computed deletion, non-configurable
properties, a false number hint, and a deliberate intermediate property-guard
miss. The directly generated property uses seed `0x5eed0023`, a 16-case
ordinary budget, a directly generated structured domain, and an independent
reference-and-effect oracle. The extended gate uses seed `0x5eed0003` and
scales it to 160 cases. Initial and intermediate nullish bases prove key
expression evaluation before coercibility and key conversion after it. Both
native specialization policies force collection.

This unit advances the runtime ABI to `m5-36` with a delete-specific
object-coercibility entry point. It preserves the existing delete nullish error
while keeping object-binding diagnostics separate.

The reviewed test262 subset adds 28 applicable pinned cases without changing
the suite revision, inventory policy, manifest schema, or classification
vocabulary. Twenty-six pass and two are expected strict identifier parse
negatives. The manifest moves from 4,174 to 4,202 cases, from 2,448 to 2,474
passes, and from 1,167 to 1,169 expected negatives; its 559 unsupported profile
features do not move, and it records no semantic or harness failures.

Private-name deletion remains an early error. `delete super.property` remains
a source-located invalid boundary instead of being lowered as an ordinary
property delete; admitting it requires the runtime `ReferenceError` and the
specified receiver, key-expression, and `ToPropertyKey` suppression order.
Deleting `Symbol` or a named error intrinsic as an identifier remains invalid
until the global-object model can remove the property and change subsequent
name resolution consistently. At non-strict Script top level,
`delete arguments` is an unresolvable-reference delete and returns `true` when
no global binding exists. An admitted ordinary function instead resolves its
implicit `arguments` object and returns `false`. Deleting `arguments` remains a
source-located invalid boundary only inside a function form whose implicit
object is deliberately unavailable, including an asynchronous function under
the current profile. Strict identifier deletion remains an early error.
Deleting a hidden `with` fallback that a prior unresolved assignment allocated
is likewise invalid until the global-object model can remove that cell
consistently.

### Object-literal prototype setters

M5a Unit 8.1c admits the noncomputed colon-form `__proto__` definition as the
object-literal prototype setter. The value expression is evaluated in source
order. An object or null value replaces the fresh literal object's
`[[Prototype]]`; any other primitive is ignored without creating an own
property. Abrupt completion stops later definitions, and the literal and value
remain rooted across the runtime operation. An anonymous function used as the
prototype value does not receive `"__proto__"` as its inferred name.

Computed, shorthand, method, getter, setter, and spread `__proto__` definitions
remain ordinary properties. They preserve their existing descriptors,
function names, replacement order, and own-key observations while coexisting
with one prototype setter. Two prototype setters in one literal are a
parse-time `SyntaxError`, including an identifier spelling paired with a
quoted spelling. Permitted ordinary forms do not participate in that early
error.

The generated property uses fixed seed `0x5eed0024` and a 16-case ordinary
budget. Its independent oracle directly generates null, object, and primitive
prototype values, all four definition positions, each permitted ordinary
`__proto__` form, inherited reads and writes versus own descriptors, effects,
abrupt completion, a false number hint and deliberate guard miss, both
specialization policies, and forced collection. The duplicate early-error
property uses seed `0x5eed0025` under both policies. Fixed Node.js, Deno, and
native fixtures cover the same boundary, including forced collection and the
AArch64 Linux cross-link.

This unit advances the runtime ABI to `m5-37` with
`oseo_object_literal_set_prototype`. The helper ignores primitive prototype
values and delegates object and null values to the existing prototype-mutation
authority.

The reviewed test262 subset adds the directly applicable duplicate-setter parse
negative. Positive upstream cases that also require `Object` reflection,
`Object.prototype`, or object-method `super` remain outside this unit instead
of borrowing partial results. The manifest moves from 4,202 to 4,203 cases and
from 1,169 to 1,170 expected negatives. Its 2,474 passes and 559 unsupported
profile features do not move. The suite revision, inventory policy, schema,
and classification vocabulary do not change, and there are no semantic or
harness failures.

### Script and module top-level `this`

M5a Unit 8.1d admits `this` at the top level of both source kinds and gives
every `this` expression the environment record that actually binds it.
ECMA-262 resolves `this` through the nearest environment with a this binding,
so an arrow carries the mode of the position it is written in rather than a
mode of its own. Owned syntax now records that mode on the expression, and HIR
and MIR keep the three cases apart.

A Script's this binding lives in its Global Environment Record, so a top-level
`this` is the realm's global this value whatever the source's strictness. A
function whose `[[ThisMode]]` is global, which is any non-strict function,
resolves a nullish call-site receiver to the same value; a function whose
`[[ThisMode]]` is strict keeps the receiver unchanged, including when it is
`undefined`. Class bodies, class field initializers, and static blocks are
strict code and keep the strict behavior. A module's this binding is a Module
Environment Record's, which ECMA-262 defines as `undefined`, so module
top-level `this` and an arrow written beside it lower to the `undefined`
constant while an ordinary function in the same module still reads its own
receiver.

The realm's global this value is deliberately the smallest object that makes
these positions correct. The runtime creates one ordinary extensible object
with a null `[[Prototype]]` on first use, the same way it creates an object
literal, and roots it permanently, so every read observes one identity across
collection and an ordinary property write on it is visible to the next read.

Its own properties are the Script bindings GlobalDeclarationInstantiation
creates on the global object, and nothing else. Those are exactly the
var-scoped top-level names: every top-level function declaration in source
order, then every hoisted `var` name that no function declaration already
owns. A Script's `let`, `const`, and `class` declarations live in the global
declarative record and are never properties, a name declared inside a function
is never one either, and module code adds nothing to the global object at all.
The property and the binding are one storage location rather than two copies:
the property stores the binding cell, so a binding write is visible through
the property, a property write reaches the binding, and a closure that
captured the binding reads the same value. Each property is writable,
enumerable, and non-configurable, so `delete this.name` reports failure
outside strict code and throws a `TypeError` inside it, while an ordinary
property the Script adds to the same object stays configurable and deletable.
`Object.defineProperty` owns the `[[Writable]]` attribute of that shared
storage: once a var-scoped property is made non-writable, an assignment
through the binding fails exactly where a property assignment fails, silently
outside strict code and with a `TypeError` inside it.

This is still not the global object. `globalThis`, the standard globals, the
`var` binding model for indirect `eval`, and the restricted-global and
non-extensible cases that a complete Global Environment Record has to answer
stay M5b work, and reviewed cases that need them keep their
`unsupported-profile-feature` classification instead of borrowing this unit's
receiver.

Because every property this unit creates is writable, enumerable, and
non-configurable, a Script top-level declaration of a name the realm already
binds as an intrinsic value is rejected with a source-located diagnostic
rather than compiled into a property that silently differs. The one admitted
collision is a function declaration over a replaceable intrinsic, such as
`function Symbol() {}` or `function TypeError() {}`: its property is
configurable, so CreateGlobalFunctionBinding redefines it whole and produces
exactly this unit's property. Every other case needs an answer the global
object does not carry yet. CreateGlobalVarBinding must leave the existing
property, and its attributes, untouched, so `var Symbol = 1` may not turn a
non-enumerable configurable property into an enumerable non-configurable one,
and `var undefined = 1` may not make a non-writable property writable.
CanDeclareGlobalFunction must throw a `TypeError` before the first statement
runs for `function undefined() {}`, `function NaN() {}`, and
`function Infinity() {}`. The same names stay ordinary bindings inside a
function and in module code, which add nothing to the global object. A
Script's lexical top-level declaration of a restricted global, such as
`let undefined = 1`, is the one collision that is not reported: ECMA-262 makes
it a `SyntaxError` through HasRestrictedGlobalProperty, but the frontend
reports only var-scoped names, so the lexical binding shadows the intrinsic
instead. Carrying the lexical names is M5b work with the rest of the Global
Environment Record.

Two further boundaries are worth naming. Annex B's block-level function
hoisting is not implemented, so a function declared in a block at Script top
level has no var-scoped binding and is therefore absent from the global
object; a reference to that name outside its block is already rejected with a
source-located diagnostic, but a global-object observation such as
`"name" in this` reports absence instead of diagnosing it. Property creation
order also follows ECMA-262 rather than the reference hosts: both Node.js and
Deno share V8, which creates global declarations in source order, while
GlobalDeclarationInstantiation creates every function binding before every
`var` binding. A fixed native scenario pins the ECMA-262 order because no host
observation can.

`this` remains an invalid assignment and update target, so `this = 1`,
`(this) = 1`, `this++`, `++this`, `var this`, and `({this})` stay parse-time
`SyntaxError`s. Because the bootstrap parser accepts TypeScript's `this`
parameter spelling wherever a binding identifier is written, every binding
position names the reserved word itself. Only a plain first parameter named
`this` is TypeScript's receiver annotation and keeps the unsupported
classification that boundary already had; a later, rest, or defaulted
parameter named `this` is a binding position and takes the early error. A
binding pattern is checked for the reserved word before any of it is
converted, because a source that names `this` is invalid in every engine
while an unadmitted construct beside it is only outside this profile, and
the reader has to be told the answer that holds. A property key spelled
`this` names an ordinary property and is unaffected.

The generated property uses fixed seed `0x5eed0026` and a 32-case ordinary
budget. Its independent oracle names the binding each position observes rather
than the value the compiler produces, and it directly generates fifteen
positions across both source kinds: Script top level with and without a
`"use strict"` directive, module top level, arrows at both, ordinary,
own-strict, generator, asynchronous, and parameter-default functions, object
methods and detached methods, class instance methods, static methods, and
fields, a detached class method, and a module continuation resumed after
top-level await. Each case also carries an absent, `var`, function, or lexical
top-level declaration and reports what the captured receiver observes of it:
the property's type before the declaration statement runs, then a binding read
after a property write, then a property read after a binding write. Half the
generated cases add a false number hint whose guarded addition reads through a
receiver and misses into the compiled generic fallback. Every case runs under
both specialization policies with forced collection and is compared with
Node.js and Deno, where indirect `eval` supplies the only host position whose
this binding is a Global Environment Record's. A strict indirect `eval` gets
its own variable environment instead of adding to the global object, so the
generated Script directive appears only beside a declaration the global object
never binds; a strict Script's own global bindings are pinned by the fixed
scenario below. Sampling is not treated as coverage: the ordinary budget
reaches thirteen of the fifteen positions and all four declaration kinds at
this seed, and the extended budget reaches all fifteen positions, so the object
method and the parameter default that the ordinary budget misses are pinned by
fixed Script, strict Script, and module fixtures instead. Those fixed Node.js,
Deno, and native fixtures retain the same Script and module boundaries,
including the AArch64 Linux cross-link.

Two fixed observations cover what no host position can. A native scenario runs
a Script and a strict Script against fixed ECMA-262 expectations for the
declaration order, the descriptors, the deletion results, and the
`[[Writable]]` interaction that indirect `eval` cannot reproduce, under both
specialization policies with a collection forced at every safepoint. A
reviewed C heap fixture retains the global this value's identity,
reachability, and non-nullish pass-through across a forced collection, keeps a
binding, its cell, and its property alive together, and pins the property
cache's cell-backed exclusion.

This unit advances the runtime ABI to `m5-38` with three entry points.
`oseo_this_value` returns a non-nullish receiver unchanged and otherwise
resolves the realm's global this value, so generated C never decides which
receiver a Script top level or a non-strict function observes.
`oseo_global_object_create` installs one Script's global-object properties from
the binding cells that already exist, once, before the script body runs.
`oseo_global_binding_set` is SetMutableBinding for a binding the global object
also exposes, so the runtime rather than generated C owns the `[[Writable]]`
check that a shared storage location carries. Because a fixed-slot property
load would hand generated code the binding cell instead of the value it holds,
the property cache excludes cell-backed slots individually; the global object's
ordinary properties keep the cache.

ToObject boxing of a primitive receiver in a non-strict function is not
reachable in this profile, because no admitted primitive prototype supplies a
callable that could receive one.

The reviewed test262 subset adds twelve directly applicable cases: the three
positive top-level `this` cases this unit admits and the nine parse negatives
that keep `this` an invalid assignment, update, and binding target. Four
already reviewed cases move from unsupported to pass because their only
missing prerequisite was a top-level `this`: the tagged-template
call-expression context, *test/language/module-code/eval-this.js*, and the two
class private-field computed-property cases whose bodies begin
`const self = this`. The manifest moves from 4,203 to 4,215 cases, from 2,474
to 2,481 passes, and from 1,170 to 1,179 expected negatives, and unsupported
profile features fall from 559 to 555. The suite revision, inventory policy,
manifest schema, and classification vocabulary do not change, and there are no
semantic or harness failures.

### Lexical and constructed `super`

M5a Unit 8.2 reconciles the profile with the semantics completed in Units 6.6
and 6.7 and admits the remaining optional-call form. An arrow captures the
enclosing function's `super()` constructor context, home object, and
`new.target` alongside its lexical receiver. The same captured home object
reaches `super` property references in nested arrows and in asynchronous class
elements. An intervening ordinary function still starts its own execution
context.

`super.m?.()` and `super[key]?.()` first perform the ordinary `super` property
lookup with the class element's home object and derived receiver kept separate.
They then guard the resulting value. A nullish value skips argument evaluation
and produces `undefined`; a present value is called with the derived receiver.
The form composes with lexical arrows and asynchronous class elements.

Every `super()` call performs a fresh construction from `new.target`'s
prototype before `BindThisValue`. A second call therefore runs the parent
against a distinct receiver and then throws the required `ReferenceError` when
it attempts to rebind the derived constructor's `this`. A private element on
the parent is installed on that fresh receiver and does not cause an earlier
duplicate-brand `TypeError`.

The existing lexical-super property retains seed `0x5eed001d`. A separate
optional-call property uses seed `0x5eed0027` across one to three nested arrows,
literal and side-effecting computed keys, and present and absent methods. Both
run under both
specialization policies with forced collection and compare independent
bounded-integer models with Node.js, Deno, and native execution. Fixed native
fixtures cover synchronous and asynchronous optional calls and distinguish
fresh construction from receiver reuse with a parent that publishes each
receiver and installs a private element. The reviewed
*super-property-optional-call.js* test262 case moves from unsupported to pass.
The manifest stays at 4,215 cases and moves to 2,482 passes, 1,179 expected
negatives, and 554 unsupported profile features with no semantic or harness
failures.

### Pattern-position `await` suspension

M5a Unit 8.3 admits `await` inside the three pattern subexpressions that the
frontend previously rejected everywhere: the object and computed key of an
assignment target member, a computed binding property name, and an array or
object binding default. They are admitted in every body that owns a traced
suspension frame, which is an ordinary asynchronous function, an asynchronous
arrow, and an asynchronous generator, and in every pattern that reaches such a
body: standalone declarations, destructuring assignment, catch parameters,
classic `for` declaration heads, and `for-of`, `for-await-of`, and assignment
heads.

The admission adds no new lowering. A pattern already lowers into the enclosing
body, and every MIR value in that body occupies a root slot of the frame, so
the acquired iterator, its captured `next` method, its done state, the prepared
assignment reference, an object binding's coercible input, and the excluded
keys of a rest property all survive a suspension and are reachable by the
collector while the frame is suspended. Removing the frontend rejection is what
lets those positions reach the machinery.

Evaluation order is unchanged by suspension. An assignment target's object and
computed key evaluate before the iterator step or source read that selects the
value it stores, and the raw key converts after that selection. A computed
binding property name evaluates before the `GetV` it names, and after
`RequireObjectCoercible` for an object pattern. A default evaluates only when
the selected value is `undefined`, so a supplied value never reaches the
operand and a rejected operand behind a supplied value never rejects anything.
An object rest keeps every excluded key computed before the suspensions that
separate them.

Abrupt completion keeps the ordinary precedence. A rejected operand raises a
throw completion at the `await` position, so an enclosing `catch` and `finally`
still run, and an array pattern whose iterator is not yet done closes that
iterator exactly once before the throw leaves the pattern. An iterator that has
already reported `done` is not closed again. Assignment and binding cell
identity is unchanged: a closure captured before the suspension observes the
write the pattern performs after it.

Module top level is not part of this admission and keeps a source-located
diagnostic for the same three positions, as recorded below.

The generated property suite uses seed `0x5eed0028` across the four pattern
positions, asynchronous functions, arrows, and asynchronous generators,
supplied and missing selections, fulfilled and rejected operands, and truthful
or false hints. Its independent oracle predicts the printed order and
completion from the case record alone, and every case runs under both
specialization policies with forced collection against Node.js, Deno, and
native execution. Fixed native fixtures cover member-target and source-key
order, defaults that are and are not taken, nested patterns, rest exclusions,
assignment cell identity, per-iteration lexical and hoisted `var` loop cells
captured by closures, `for-of` and `for-await-of` heads, a single close of an
unfinished iterator, a done iterator that is not closed, a rejected key and a
rejected target, `finally` precedence, a catch parameter, an asynchronous
generator that mixes `await` and `yield` in the same positions, and a false
number hint with a deliberate guard miss that reaches the compiled generic
fallback.

No reviewed test262 case exercises these positions: an AST scan of all 47,381
candidate paths finds `await` inside a pattern in seventeen cases, and every
one of them is either module code or a parse negative for function parameters.
Three of those parse negatives enter the reviewed subset here, pinning that the
admission does not reach an asynchronous arrow's or asynchronous generator's
formal parameters and does not propagate the module Await capability into a
nested function's parameters. The one module positive enters as inventory
evidence only: its declared `dynamic-import` feature stops it before
compilation, so it classifies `unsupported-profile-feature` without reaching
the module diagnostic recorded below, which package tests prove instead. The
manifest therefore
grows to 4,219 cases and stays at 2,482 passes, with 1,182 expected negatives
and 555 unsupported profile features and no semantic or harness failures.

### Async-from-sync delegated throw

M5a Unit 8.4 closes the reviewed
*AsyncFromSyncIteratorPrototype/throw/iterator-result.js* gap. The case
delivers a throw to an asynchronous generator suspended in `yield*` over a
wrapped synchronous generator, expects the step promise to reject with the
forwarded reason after the wrapper calls the synchronous
`%GeneratorPrototype%.throw`, and then observes the completed iterator.
Tracing that forwarding against Node.js and Deno found two real defects.

The runtime's virtualized `%GeneratorPrototype%.throw` had no context cache
slot of its own, so its lookup fell through to the `[Symbol.iterator]` self
function's slot and whichever method a program resolved first answered both
keys afterward. Any program that acquired a generator's iterator before
delivering a throw therefore called the self function instead of resuming the
generator: the delegating step fulfilled with the generator object where a
reference host rejects with the forwarded reason. The `m5-39` runtime ABI
gives the throw method its own permanently rooted cache field, so `next`,
`return`, `throw`, and `[Symbol.iterator]` now keep four distinct cached
identities in every resolution order.

The synchronous `yield*` lowering also reported the wrong delegation result
when a forwarded throw ended the delegation: the shared exit read the `next`
step's result slot, so a `throw` result carrying `done` reported the last
stepped object instead of its own `IteratorValue`. The exit now joins through
a block parameter each ending step supplies, matching the asynchronous
delegation's join.

Two fixed fixtures cover the repaired paths against Node.js, Deno, and native
execution under both specialization policies and forced collection. The
synchronous *generator-delegated-throw* fixture resolves the throw method
before the program's first `[Symbol.iterator]` read, forwards uncaught and
caught throws through `yield*` to an inner generator, observes the inner
`finally`, the rethrown reason's identity, and both completed states, and
completes a delegation through a hand-written iterator's done `throw` result.
The asynchronous *async-from-sync-delegated-throw* fixture forwards a throw
through the wrapper to a synchronous generator in the reviewed case's shape,
observes the rejection reason's identity and the completed state of both
iterators, and keeps a caught forwarded throw delegating. The defect domain
is a fixed method-identity and join-value fault, so no new property suite is
added; the existing generator throw-resumption and delegation suites keep
their seeds and domains. The reviewed case enters as a pass, and the manifest
grows to 4,220 cases: 2,483 passes, 1,182 expected negatives, and 555
unsupported profile features with no semantic or harness failures.


Known gaps inside the claim
---------------------------

Each gap names its owner. This list shrinks as M5 lands semantic units; it
must never shrink by reclassification alone.

 -  The BigInt primitive, exact literals, `ToNumeric`, comparisons, operators,
    assignment, and update are admitted by M5a Unit 8.1a as recorded above.
    The callable `BigInt` intrinsic, `BigInt.prototype`, wrappers, constructor
    behavior, and fixed-width conversions remain M5b work owned by the
    intrinsics and built-in objects stream. Reviewed cases that also require
    those facilities or another unimplemented intrinsic remain
    `unsupported-profile-feature` instead of borrowing a partial M5a result.
    [*PLAN-BIGINT.md*](../PLAN-BIGINT.md) owns the remaining checkpoint.
 -  Regular expression syntax, objects, matching, and ahead-of-time literal
    compilation are outside the admitted profile and owned by
    [*PLAN-REGEXP.md*](../PLAN-REGEXP.md).
 -  There is no longer one undifferentiated remaining expression grammar gap.
    The optional chaining and tagged template entries above name their fixed
    native evidence, generated suites with seeds `0x5eed0019` and
    `0x5eed001a`, and reviewed test262 cases. The forms that remain outside the
    profile have specific boundaries: BigInt and regular expressions are
    recorded above, and dynamic import and module top-level pattern-position
    `await` are
    recorded below. M5a Unit 8.1c admits the object-literal prototype setter,
    Unit 8.1d admits Script and module top-level `this`, and Unit 8.2 admits the
    remaining M5a `super` and `new.target` forms, as recorded above.
 -  `import.meta` remains rejected with a source-located diagnostic. Owner:
    the modules and asynchronous execution stream.
 -  A `super` property reference in a class body without `extends` and in an
    object literal method stays rejected until the intrinsic graph provides
    the `Object.prototype` object such a lookup reaches. Owner: the intrinsics
    and built-in objects stream.
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
 -  `globalThis` and the global object do not exist. M5a Unit 8.1d gives
    Script top-level `this` and every non-strict nullish receiver one
    realm-wide global this value whose own properties are the Script's
    statically known var-scoped top-level bindings, as recorded above,
    but that object is not the global object. Admitting the global object
    requires the intrinsic graph to expose standard constructors as real
    values first, Annex B block-level function hoisting so that a
    function declared in a block reaches the same binding model, the
    restricted-global and non-extensible cases a complete Global
    Environment Record answers, indirect `eval` var bindings, and an owned
    architecture decision on how a mutable global object meets
    closed-world name resolution before any dynamically created global
    binding is admitted. The reviewed *test/language/global-code/*
    directory is directly applicable to that model and is not yet in the
    reviewed subset. The reviewed
    *test/language/statements/with/12.10-2-4.js* and
    *test/language/statements/with/12.10-2-5.js* cases each contain a
    failure-only read of the unresolved global `x` outside the `with`
    environment. Their intended nullish `TypeError` path has fixed native
    evidence, but the complete upstream source remains
    `unsupported-profile-feature` until this global binding model lands.
    Owner: the intrinsics and built-in objects stream; the surface audit in
    [*PLAN-M6.md*](../PLAN-M6.md) depends on this unit.
 -  Await inside a computed member of an assignment target, a computed binding
    property name, or an array or object binding default is admitted by M5a
    Unit 8.3 in ordinary asynchronous and asynchronous generator bodies, as
    recorded above. The same positions stay rejected with a source-located
    diagnostic at module top level, where suspension comes from the module
    continuation transform rather than a traced frame: that transform splits
    statements around whole `await` expressions and has no way to split the
    steps of a pattern. No reviewed test262 case exercises the module form on
    its own; the one upstream case that does,
    *top-level-await/syntax/catch-parameter.js*, is reviewed and classifies
    `unsupported-profile-feature` for its declared `dynamic-import` feature
    before it reaches this diagnostic. Package tests in
    *packages/parser-babel/tests/bindings.test.ts* and
    *packages/compiler/tests/modules.test.ts* prove the diagnostic and its
    location. Owner: the modules and asynchronous execution stream.
 -  `PromiseResolve` does not read the resolved value's `constructor`. The
    specification returns an already-native promise unchanged only after
    `SameValue(value.constructor, %Promise%)` holds, so a value carrying a
    throwing `constructor` getter must make the operation abrupt. This
    profile resolves the value without that read, so the getter never runs
    and the abrupt completion the specification propagates never appears.
    Six reviewed-candidate cases turn on the difference and stay outside the
    reviewed subset: three *AsyncFromSyncIteratorPrototype/* poisoned-wrapper
    cases and the three *AsyncGeneratorPrototype/return/* broken-promise
    cases. Closing
    it needs `Promise` as a materialized intrinsic value to compare against.
    Owner: the intrinsics and built-in objects stream.
 -  `%GeneratorFunction%` and `%GeneratorFunction.prototype%` are not
    materialized. Reaching either needs `Object.getPrototypeOf`, and
    creating a generator function from one needs the dynamic-source
    boundary of [ADR 0016](./adr/0016-dynamic-source-boundary.md), so the
    reviewed *test/built-ins/GeneratorFunction/* cases carry the
    `dynamic-source` tag. There is no `GeneratorFunction` global binding in
    ECMAScript, so this profile does not add one. Owner: the intrinsics and
    built-in objects stream.
 -  `Object.getPrototypeOf` is not admitted, and neither `Object` nor
    `Promise` is admitted as a value. Every reviewed
    *test/built-ins/AsyncGeneratorPrototype/* and
    *test/built-ins/AsyncIteratorPrototype/* case reaches the intrinsics it
    checks through one of the three, so the cluster this profile now
    materializes promotes none of them and they keep the
    `unsupported-profile-feature` classification their compile-stage
    `OSEO1001` produces. Owner: the intrinsics and built-in objects stream.
 -  `eval`, the `Function` constructor, and dynamic import stay explicitly
    unsupported under [ADR 0016](./adr/0016-dynamic-source-boundary.md).
    Reviewed cases that need them carry the `dynamic-source` dependency
    tag, and no release uses an unqualified conformance label while this
    boundary stands.
 -  Realm creation beyond the initial realm, agent clusters, and shared
    memory need runtime and harness capabilities that do not exist yet;
    affected tests name the missing `$262` capability.
 -  The reviewed harness implements *base.js*, *doneprintHandle.js*,
    *asyncHelpers.js*, *compareArray.js*, and *propertyHelper.js* only. Cases
    that include *promiseHelper.js* or *nativeFunctionMatcher.js* stay out of
    the reviewed subset until those includes have reviewed implementations;
    the eight *test/built-ins/Function/prototype/toString/* cases the
    `async-iteration` tag reaches need the second of them. The reviewed
    *asyncHelpers.js* probes `$DONE` with `typeof` rather than through
    `Object.prototype.hasOwnProperty.call(globalThis, "$DONE")`, and its
    `assert.throwsAsync` reports a constructor mismatch without composing a
    message from the observed value, because this profile admits neither
    `globalThis` nor generic string coercion. Owner: the standards harness
    expansion in [*PLAN-M5.md*](../PLAN-M5.md).
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

CI can execute the reviewed subset in deterministic round-robin partitions by
passing `--shard INDEX/TOTAL` to `mise run test:test262`. Every one-based index
for the selected total must complete on each matching host. Each shard compares
only its selected observations with the corresponding entries in the complete
checked-in manifest. Manifest regeneration remains an unsharded operation.

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
