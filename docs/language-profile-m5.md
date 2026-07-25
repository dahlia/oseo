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

The current manifest contains 681 reviewed cases: 310 passes, 245 expected
negatives, and 126 unsupported profile features. It records no semantic or
harness failures.


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
    short-circuited logical assignment skips that second conversion. Immutable
    and imported targets retain their catchable write errors. Native
    differential fixtures and a generated property with seed `0x5eed000d`
    cover all 15 operators, both target forms, short-circuiting, reference and
    conversion counts, both specialization policies, and forced collection.
    Await inside a compound assignment remains rejected until continuation
    extraction can retain the already-read current value.
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
    rejected because the current continuation representation cannot preserve
    completed iteration without observing it again. Native differential
    fixtures, generated Node, Deno, and native properties under both
    specialization policies and forced collection, MIR structural tests, and
    five reviewed test262 cases cover accumulation. Deliberate
    boundaries: string and other primitive iteration, which the
    specification reaches by boxing, is unsupported; the promise combinators,
    `for-of`, array spread, call spread, constructor spread, and array binding
    declarations accept only
    object iterables. The array iterator methods are array-specific rather than
    the generic `%Array.prototype.values%`; and `for-await-of`, array and string
    iterator prototype identity, and generator-based iterators remain outside
    the admitted syntax.
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
    is rejected until continuation extraction can retain an accumulated
    argument prefix. Native differential fixtures, generated Node, Deno, and
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
    Optional members remain unhinted. Assignment member targets, `export var`,
    and `await` inside a default remain outside this array declaration syntax
    unit.
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
    Optional members remain unhinted. Assignment member targets, `export var`,
    and `await` inside a property name or default remain outside this object
    declaration syntax unit.
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
    types continue through unambiguous nested array rest targets; object targets
    inside an array rest remain unhinted. Computed object properties remain
    unhinted even when their source key is a literal. Type references that
    require alias or interface resolution remain a source-located unsupported
    boundary. Ordinary functions retain dynamic `this`, arrows retain lexical
    `this`, and constructors initialize their receiver before parameter work.
    JavaScript function length is retained independently from the ABI parameter
    count.
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
    properties, and object rest descriptors. Assignment member targets,
    pattern type annotations, and `await` inside a
    property name or default remain outside this syntax unit.
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
    is rejected until that nested suspension position has an owned continuation
    contract. Native differential fixtures cover identifier and member targets.
    A generated property with seed `0x5eed000c` also covers parenthesized member
    targets, array and object inputs, defaults, rest, nullish failure, result
    identity, both specialization policies, and forced collection. Fourteen
    reviewed test262 cases add strict and non-strict evidence for identifier and
    member writes, nested patterns, defaults, rest, result identity, nullish and
    immutable target errors, and function-name inference. Synchronous `for-of`
    assignment heads reuse this pattern and target contract. Pattern type
    annotations and `await` inside a source property name, default, or member
    target remain outside this syntax unit.


Known gaps inside the claim
---------------------------

Each gap names its owner. This list shrinks as M5 lands semantic units; it
must never shrink by reclassification alone.

 -  Classes, generators, big integers, regular expressions, and the remaining
    expression grammar are outside the admitted syntax. Owner: the
    core expressions and bindings stream in
    [*PLAN-M5.md*](../PLAN-M5.md), with regular expression syntax, objects,
    matching, and ahead-of-time literal compilation owned by
    [*PLAN-REGEXP.md*](../PLAN-REGEXP.md).
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
