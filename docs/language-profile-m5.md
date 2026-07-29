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

The current manifest contains 3,920 reviewed cases: 1,772 passes, 1,119
expected negatives, and 1,029 unsupported profile features. It records no
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
    forced collection. Fourteen reviewed test262 cases pass and twelve
    expected negatives retain the tagged-template, assignment-target, update,
    and invalid `super()` grammar errors. Eleven unsupported cases record
    independent prerequisites including tagged templates, dynamic source,
    `for-in`, restricted asynchronous `await` positions, `String`, `Reflect`,
    regular expressions, and an optional call through a `super` property.
    Deliberate boundary: `delete value?.property` is rejected with a
    source-located diagnostic, because optional chaining as a `delete` operand
    is not lowered yet. The
    remaining directory case stays outside the reviewed subset because its
    async function reaches `.call` through a function-intrinsic path that is
    not materialized yet.
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
    Direct fixed-length tuple spreads expand before mapping, including members
    before a following suffix. Expanded members follow the ordinary
    primitive-hint and unsupported-type rules. Optional members and ambiguous
    positions after a variadic array rest or type-reference spread remain
    unhinted. If an inline annotation gives a nested array binding subtree
    another container shape, that subtree remains unhinted without a diagnostic
    while matching siblings continue to map. Root container mismatches and type
    annotations that require resolution remain source-located unsupported
    boundaries. Assignment member targets, `export var`, and `await` inside a
    default remain outside this array declaration syntax unit.
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
    unsupported boundaries. Assignment member targets, `export var`, and
    `await` inside a property name or default remain outside this object
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
    boundaries: the Annex B `__proto__` property-name special case is
    rejected with a source-located diagnostic in every syntactic form
    including shorthand and method keys, and an object spread preceding a
    later top-level await point is rejected for the same evaluation-order
    reason as array, call, and constructor spread. Native differential
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
    iterator first. Deliberate boundaries: `%GeneratorPrototype%.throw` and
    generator method definitions in object literals are rejected with
    source-located diagnostics. No throw
    resumption can reach a synchronous body while
    `%GeneratorPrototype%.throw` is unimplemented, so a synchronous
    delegating expression never reads the inner
    iterator's `throw` method. Default and
    binding-pattern generator parameters are also rejected, because this
    profile lowers them as body statements that the generator body would only
    reach on the first resumption, which `FunctionDeclarationInstantiation`
    requires to happen at the call instead. Simple and rest parameters are
    admitted and keep the ordinary call ABI. `%GeneratorPrototype%` exists as a
    reachable object with virtualized methods rather than own properties, and
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
    `star-throw-is-null` cases stay out of the reviewed subset until
    `%GeneratorPrototype%.throw` lands, and `star-string` stays out until
    strings are iterable. The twenty-three reviewed
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
    lowering object literal async methods already use; generator and
    asynchronous generator methods stay rejected with that shared
    diagnostic. Native differential fixtures retain the empty class,
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
    identifier early errors, and six new unsupported cases record the
    unresolvable computed accessor key, the static field element name, and
    the generator methods the `fn-name` and `fn-length` static precedence
    cases require. The reviewed manifest moves to 950 passes, 379 expected
    negatives, and 156 unsupported profile features with no semantic or
    harness failures.
 -  Class inheritance through `extends`, the `super()` call, and
    `new.target`. A class expression carries its `extends` operand as one
    heritage expression that MIR lowers inside the class-scope environment
    before the constructor closure exists, so a heritage operand that reads
    the class name observes its temporal dead zone and a side effect in it
    runs before any element key. A new `class-heritage` runtime entry point
    validates the operand and links both chains at once: the constructor's
    [[Prototype]] becomes the parent constructor and the class `prototype`
    object's [[Prototype]] becomes `Get(parent, "prototype")`. Static members
    therefore resolve through the constructor chain and instance members
    through the prototype chain, `instanceof` walks the whole chain, and both
    objects stay out of dictionary mode because a class definition allocates
    them itself. An operand that is neither `null` nor a constructor throws a
    `TypeError`, as does a constructor whose `prototype` is a primitive; a
    `null` operand leaves both chains null, which is what an ordinary
    function's [[Prototype]] already is in this runtime.
    A derived class constructor owns a `this` binding instead of reading its
    receiver directly. The binding is a fresh uninitialized cell per
    invocation, so reading `this` before `super()` throws a `ReferenceError`
    through the same temporal-dead-zone machinery lexical declarations use,
    and every arrow function nested in the constructor shares that cell and
    therefore observes the receiver `super()` bound even when the arrow was
    created earlier. `super()` reads the running constructor's own
    [[Prototype]], rejects a non-constructor with a `TypeError`, constructs it
    against the receiver the `new` expression allocated from `new.target`'s
    prototype, and binds the result; a second `super()` in one invocation
    throws a `ReferenceError`. Because the parent's completion value is what
    gets bound, a base constructor that returns its own object replaces the
    allocated receiver for the rest of the derived constructor. An error
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
    Deliberate boundaries: `super()` and `new.target` inside an arrow
    function are rejected with a source-located diagnostic, because an arrow
    takes both from the function enclosing it and this profile captures
    neither lexically yet. Native differential
    fixtures cover a two-level and a three-level chain, an inherited method,
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
    unsupported cases record this unit's boundaries: `super()` from an arrow
    function, `super.property`, and the `Reflect`, tagged template,
    `Function.prototype.bind`, typed-array, and `Object` intrinsics that other
    inheritance cases need. The two `definition/prototype-getter` and
    `definition/prototype-setter` cases leave the reviewed subset until
    `Function.prototype.bind` exists, because the heritage they build starts
    from a bound function. The reviewed manifest moves to 1016 passes, 382
    expected negatives, and 169 unsupported profile features with no semantic
    or harness failures.
 -  `super` property references inside a class body with `extends`. A class
    definition records each element's home object: the class `prototype`
    object for an instance element and the constructor itself for a `static`
    one, which are the two objects `class-heritage` already links. A
    reference reads the [[Prototype]] of the home object its running function
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
    reads the home object's [[Prototype]] after that key, so a key
    expression that replaces the prototype is observed by the very
    reference it precedes. A home
    object whose [[Prototype]] is null, as `extends null` leaves it, reports
    the `TypeError` the read or write itself raises.
    Deliberate boundaries: a `super` property reference is rejected with a
    source-located diagnostic in a class body without `extends` and in an
    object literal method, because this runtime has no `Object.prototype`
    object for such a lookup to reach; inside an arrow function, which owns
    no home object; inside an asynchronous class element, whose body runs in
    a synthesized function that carries none; and as the operand of `delete`,
    a destructuring assignment target, or a `for` head, which name a target
    this lowering does not carry a receiver through. Native differential
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
    and on the constructor. Eighteen reviewed test262 cases newly pass:
    fifteen newly reviewed cases covering the `prop-dot` and `prop-expr`
    value, receiver, null-prototype, and uninitialized-`this` families and
    the `super` in-method, in-accessor, and static in-accessor cases, and
    three that leave the unsupported list, including the three-level
    `prop-dot-cls-val` chain and the `new.target` value read through a
    `super` property. Thirty-three new unsupported cases record this unit's
    boundaries: an object literal `super`, a class body without `extends`, an
    arrow, and `eval`, together with the `Object.freeze`,
    `Object.setPrototypeOf` ordering, `Object` heritage, and `Test262Error`
    observations the remaining cases need. The reviewed manifest moves to
    1034 passes, 382 expected negatives, and 199 unsupported profile features
    with no semantic or harness failures.
 -  Public instance class fields. A `field = expression` element records the
    key its class body evaluates once and a closure that produces the value
    once per instance, in class-body order, on the constructor itself. That
    pair is ECMA-262's [[Fields]], and the constructor runs it as
    InitializeInstanceElements: a base constructor before its body, which is
    where [[Construct]] performs it and therefore before a parameter default
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
    element once and write it once through the same private name. Deliberate
    boundaries: a static private method or accessor, `#name in object`, a
    private reference whose base is anything other than `this`, optional
    `?.#name` access, and a private reference used as a destructuring or
    `for-of` assignment target are rejected with source-located diagnostics,
    and `delete this.#name` is reported as the early error it is. Native
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
    constructor runs no instance element initialization at all. Deliberate
    boundaries: a static private method or accessor and a static private
    field reached as `C.#name` rather than
    through `this` are rejected with source-located diagnostics, and a static
    field named `constructor` or `prototype` stays the early error it is.
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
    early errors, and sixty-eight new unsupported cases record the `C.#name`
    boundary this unit keeps. The reviewed subset gains the
    `class-static-fields-public` and `class-static-fields-private` feature
    tags; the remaining cases those tags reach need `String`, further
    `Object` members, `eval`, `Proxy`, `Function`, static private methods, or
    generator and asynchronous methods, and stay outside the reviewed subset
    until the units that own them land. The reviewed manifest moves to 1,203
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
    *static-init-sequence.js*, needs `Array.prototype.push` and stays outside
    the reviewed subset until the unit that owns it lands, with the same
    interleaving covered by a native fixture meanwhile. The reviewed manifest
    moves to 1,230 passes, 898 expected negatives, and 373 unsupported
    profile features with no semantic or harness failures.
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
    directly: twenty-five pass, four are unsupported, and the nine that stay
    outside the reviewed subset belong to the three gap entries named below.
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
    body and at module top level; an awaited iterable expression in the head
    keeps the existing rejection for an await outside the M4 continuation
    positions. Native differential fixtures cover the synchronous fallback,
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
    is unsupported. A suspension inside the loop drains the scheduler instead
    of returning to the caller, which the gap entry below owns.
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
    M4 continuation positions. The frontend's existing destructuring
    restriction still applies to an asynchronous generator body: `await`
    inside a computed member of an assignment target, a computed binding
    property name, or an array or object binding default is rejected with a
    source-located diagnostic, because this profile lowers a pattern's
    subexpressions before the suspension machinery reaches them.
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
    Deliberate boundaries: asynchronous generator method definitions in object
    literals and class bodies stay rejected with the same diagnostic
    synchronous generator methods get, and default or binding-pattern
    parameters stay rejected for the same ordering reason. The awaits a
    `yield*` step takes drain the scheduler rather than returning to the
    caller, which the `for await` gap entry below owns.
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


Known gaps inside the claim
---------------------------

Each gap names its owner. This list shrinks as M5 lands semantic units; it
must never shrink by reclassification alone.

 -  Big integers, regular expressions, and the remaining expression grammar
    other than optional chaining are outside the admitted syntax. Owner: the
    core expressions and bindings stream in
    [*PLAN-M5.md*](../PLAN-M5.md), with regular expression syntax, objects,
    matching, and ahead-of-time literal compilation owned by
    [*PLAN-REGEXP.md*](../PLAN-REGEXP.md).
 -  Static private methods and accessors and `export default class` are
    outside the admitted class subset. A private
    element is reachable only through `this`, so a cross-instance
    `other.#name` reference, a static private field read as `C.#name`, the
    `#name in object` brand check, optional `?.#name` access, and a private
    destructuring or `for-of` assignment target remain rejected. `super()`,
    `super.x`, and `new.target` are rejected inside an arrow function, and
    an optional call through a `super` property remains rejected. `super.x` is
    also rejected inside an asynchronous class element, because
    this profile captures none of them lexically yet. A `super` property
    reference in a class body without `extends` and in an object literal
    method stays rejected until the intrinsic graph provides the
    `Object.prototype` object such a lookup reaches. Owner: the functions and
    executable syntax stream.
 -  `super()` runs the parent against the receiver the `new` expression
    already allocated instead of performing a fresh `Construct` per call, so a
    second `super()` in one invocation runs the parent a second time against
    that same receiver rather than a new one. When the parent declares no
    private element, the `ReferenceError` the second call must throw still
    follows and the parent still runs exactly twice, so the difference is
    observable only to a parent that publishes or mutates its receiver during
    a call that is already doomed. When the parent does declare a private
    element, reinstalling it on the receiver that already carries it throws a
    `TypeError` from InitializeInstanceElements before the parent body runs a
    second time, so that case reports the wrong error type and runs the parent
    once rather than twice. Closing both needs a runtime `Construct` path that
    allocates at the base-constructor boundary. Owner: the functions and
    executable syntax stream.
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
 -  Inside an ordinary asynchronous function body, `await` is restricted to
    the M4 continuation positions, and asynchronous module cycles are
    unsupported. An asynchronous generator body has no such restriction,
    because it suspends through its own saved frame rather than through the
    frontend's continuation split. Owner: the functions and executable syntax
    stream.
 -  A `for await` step, and each step of a `yield*` inside an asynchronous
    generator, suspends by draining the scheduler rather than by
    returning to the caller. The frontend splits an `await` expression into
    continuations, and a loop has no such split, so each step resolves its
    promise, runs the queued jobs in order, and advances timers until that
    promise settles, then resumes the loop directly. Interleaving with jobs
    already queued is preserved, but the enclosing asynchronous function does
    not return to its caller at a step, so work sequenced after the call
    observes the loop's effects first, and a step whose promise can never
    settle reports the host diagnostic `OSEO3001` instead of leaving the
    function pending forever. Four test262 cases turn on the difference and
    stay outside the reviewed subset:
    *async-from-sync-iterator-continuation-abrupt-completion-get-constructor.js*
    and the three _ticks-with-\*-constructor-lookup_ cases, which also need
    `Promise` as a value. Closing it needs the suspension record asynchronous
    generators now own to reach ordinary asynchronous function bodies and the
    delegation steps as well. Owner: the functions and executable syntax
    stream.
 -  AsyncFromSyncIteratorContinuation does not close the wrapped synchronous
    iterator when the value it awaits rejects. The specification closes the
    synchronous iterator before the wrapper's promise rejects whenever the
    continuation was reached with `closeOnRejection` set, so a synchronous
    iterator whose step reports a rejected promise never observes its own
    `return` method here, while the rejection itself still reaches the
    consumer unchanged. Five reviewed-candidate
    *test/built-ins/AsyncFromSyncIteratorPrototype/* cases turn on the
    difference and stay outside the reviewed subset, four under *next* and one
    under *throw*. Owner: the functions and executable syntax stream.
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
 -  `%GeneratorPrototype%.throw`, generator method definitions, and default
    or binding-pattern generator parameters are outside the admitted
    generator subset. Because no throw resumption can reach a synchronous
    body, the `throw` branch of the synchronous `yield*` is unreachable and
    unimplemented. The missing method is observable one step further out:
    a `throw` delivered to an asynchronous generator suspended inside a
    `yield*` over a synchronous generator finds no `throw` method on that
    generator, so the delegation closes it and reports a `TypeError` where
    the specification forwards the completion.
    *test/built-ins/AsyncFromSyncIteratorPrototype/throw/iterator-result.js*
    is the reviewed candidate that turns on it and stays outside the reviewed
    subset. Owner: the functions and executable syntax stream.
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
