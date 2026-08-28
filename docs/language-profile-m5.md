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

M5a is complete. The normative family records described below inventory 95
admitted M5 families and assess every evidence class. M5 remains active through
its M5b and M5c checkpoints.


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
indexes the reviewed observation partitions. The checked-in manifest
implements the schema frozen by ADR 0013: six classifications with
`expected-negative` covering matched negatives in every phase and
`infrastructure-failure` separated from harness defects, execution evidence
with the executed variants and target, reviewed dependency tags, and summaries
with raw, path-group, and dependency totals. Unsupported, harness, and
infrastructure results never increase the pass count.

The current manifest contains 14,188 reviewed cases: 10,398 passes, 1,506
expected negatives, and 2,284 unsupported profile features. It records no
semantic, harness, or infrastructure failures.


Normative family records
------------------------

The complete language profile is the union of the frozen
[M3](./language-profile-m3.md) and [M4](./language-profile-m4.md) profiles and
every indexed M5 family record. M3 and M4 remain the normative owners of their
admitted behavior; M5 does not duplicate those families or claim new ownership
of them.

The files under *language-profile-m5/index/* are the normative index. Each
index file names one record under *language-profile-m5/families/* with the same
stable kebab-case ID and filename. A family addition creates its own index and
record files, so two family lanes do not edit one shared inventory file.

Every record uses version 1 of this fixed template:

 -  stable family ID, title, scope, and owning contract references;
 -  exactly one assessment for each evidence class; and
 -  either `covered` with existing references, or `omitted` with a reason and
    existing replacement references.

The exact evidence-class vocabulary is `differential`, `generated`,
`specialization`, `guard-fallback`, `forced-collection`, `structural`, `fixed`,
and `standards`. These names represent generated or property evidence,
execution under both specialization policies, deliberate guard miss through a
compiled generic fallback, forced collection, structural IR or generated-code
checks, fixed or unit evidence, and applicable standards evidence. The records
may not use `unassessed`.

`mise run check:evidence-lanes` validates the complete current-tree index and
record set. The compatibility ratchet snapshots the stable IDs, so removing an
admitted family is a monotonicity violation without an override path.


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


M5a implementation history
--------------------------

The following narrative preserves the implementation and measurement history
that produced the records. It is not the normative family inventory or the
current evidence assessment. Those live only in the indexed records above.

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
 -  `typeof` applied directly to an unresolvable name evaluates to
    `"undefined"`, as ECMA-262's unresolvable-reference step requires.
    M5a Unit 8.5i decides resolvability ahead of time the same way the
    Unit 8.1b identifier delete does, so the result folds to the string
    constant without reading or creating any binding, and every other
    unresolved reference keeps its source-located rejection, including a
    member access, a sequence operand, and an assignment target. Inside
    `with`, every active object environment is consulted first: a hit
    inspects the supplied value through the ordinary property read, a
    resolved lexical fallback performs the ordinary binding read
    including its temporal dead zone error, and a genuinely unresolvable
    fallback produces `"undefined"` rather than an uninitialized-cell
    error. A folded `typeof`, direct or through `with`, of a name any
    `with` region of the same program uses as an unresolved assignment
    target stays a source-located rejection regardless of source order
    or position, since ECMA-262 models that sloppy assignment as
    creating a real global binding whose value the folded answer would
    misreport, the same hidden-fallback boundary the Unit 8.1b delete
    records. Only an operation that reaches PutValue on an all-miss
    chain records the name: a non-strict simple assignment or a
    non-strict destructuring or loop assignment target. A compound or
    logical assignment and an update expression read first and throw
    ReferenceError on the uninitialized cell before any write, so a
    caught attempt leaves the name genuinely unresolvable and keeps the
    fold admitted in either mode. A strict fallback write, whose
    all-miss PutValue ECMA-262 makes throw instead of creating a
    global, is itself a source-located rejection until that strict
    throw is lowered, so it neither runs with sloppy semantics nor
    poisons the fold.
    `typeof` of an unshadowed runtime-owned intrinsic name the profile
    still admits only as a call target, such as `console`, stays a
    source-located rejection: the realm binds that name to a real
    value, so `"undefined"` would misreport it, the same boundary
    the Unit 8.1b identifier delete records. A name the profile has
    since materialized, such as `Object`, `Number`, `Promise`, `String`,
    or `Math`, reads the realm global object's property instead. The same
    rule covers every
    other global name ECMA-262 clause 19 requires of the pinned
    ECMAScript 2025 realm, such as `JSON`, `Array`, `eval`, and
    `globalThis`: an unshadowed `typeof` of one stays a source-located
    rejection until the profile admits the name as a value, so the fold
    answers `"undefined"` only for a name no conforming realm of the
    pinned edition is required to bind; Annex B additions such as
    `escape` stay excluded from the claim and remain ordinary
    unresolvable names. HIR and MIR structural
    tests, a fixed native differential fixture, a generated property
    suite with seed `0x60002d00`, and the reviewed test262
    unresolvable-reference case cover the boundary.
 -  The `&&` and `||` logical operators and the conditional `?:` operator,
    lowered through explicit MIR branches and a parameterized join block.
    The untaken operand never evaluates, the produced value is the operand
    value rather than a coerced boolean, and evaluation order and abrupt
    completion follow the lowered control flow. `??` and the logical
    assignment operators are admitted by their later entries below. Ordinary
    asynchronous functions
    retain the selected path in their traced suspension frame, so `await`
    is admitted in logical and conditional operands there. Module top level
    uses its private traced frame for the same conditionally evaluated
    suspension.
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
    through to the enclosing loop. M5a Unit 8.5e admits a function
    declaration in a switch clause: every clause's function is
    instantiated once, at CaseBlock entry, sharing the same scope its
    `let`, `const`, and class declarations already share, so a function
    is callable through any clause the discriminant reaches regardless
    of which clause declares it or whether that clause ever runs. A
    duplicate function name in the shared scope is always the early
    error the existing scope already enforces for any other duplicate:
    ECMA-262 exempts it only for a host that implements Annex B's
    Block-Level Function Declarations Web Legacy Compatibility
    Semantics, which this profile does not, so no duplicate function
    name is admitted regardless of a matching ordinary kind or the
    code's strictness, the same boundary Unit 8.5d records for a
    block-level function. Annex B's paired web legacy semantics, which
    would also copy a function's value out to a same-name var-scoped
    binding in sloppy mode, remain unimplemented as well.
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
    Generated Node, Deno, and native evidence uses seed `0x60001300` across
    both pattern families, all three declaration kinds, defaults, rest,
    nullish inputs, both specialization policies, and forced collection. Fixed
    fixtures retain temporal dead zones, conditional iterator close, lexical
    closure identity, and post-loop `var` values. Seven reviewed test262 cases
    pin array defaults, trailing object patterns, and object rest.
    The empty
    statement is also admitted as a no-op block, and M5a Unit 8.5f admits
    the `debugger` statement as the same no-op, as recorded below. M5a
    Unit 8.5l admits the `for-in` statement, recorded below.
 -  The `for-in` statement with base enumeration semantics and simple
    heads, admitted by M5a Unit 8.5l. ForIn/OfHeadEvaluation reports a
    break completion for an `undefined` or `null` subject, so the whole
    statement is skipped without an error and without a ToObject
    conversion, and an enumerate iterator is never closed: an abrupt head
    reference, an abrupt store, and a `break`, `continue`, `return`, or
    `throw` in the body leave the loop through the enclosing transfer
    alone. ECMA-262 leaves the enumeration's mechanics and order
    unspecified and states rules instead, so the point at which each
    level's own keys are obtained is an observable choice; this profile
    makes the choice both reference hosts make and collects the whole
    prototype chain once, when the enumeration is acquired. Collection
    walks the chain outward and takes each level's own string keys in
    OrdinaryOwnPropertyKeys order of ascending array indices then
    creation order; symbol keys are dropped; a name already recorded at
    a nearer level is skipped whether or not that nearer property was
    enumerable, which is the specified shadow rule, so a non-enumerable
    own property suppresses the same name on every prototype behind it
    and no name is collected twice; and a surviving name is collected
    only if its own property was enumerable when its level was read.
    Each step then reports the next collected name while the receiver
    still has a property of that name anywhere on its materialized
    prototype chain, which is what makes a
    property deleted before it is processed ignored, while
    a property added during the enumeration, a prototype replaced during
    it, and a collected property made non-enumerable during it are all
    invisible to it. The alternative reading, the informative generator
    ECMA-262 prints beside the rules, obtains a prototype's own keys
    only when the walk reaches it; both readings satisfy every stated
    rule, and the fixed fixture pins the five observations that
    distinguish them against Node.js and Deno. No step runs user code,
    because this realm has no proxy and no exotic object whose own-key,
    descriptor, or prototype access is observable, so the enumeration
    cannot be reentered and reports no abrupt completion of its own.
    ToObject is modeled rather than materialized while primitive
    wrappers remain outside the profile: a string subject reports one
    enumerable own index property per code unit and a non-enumerable
    `length`, which is the shape the M5b `string-intrinsic` node later
    gives both the String exotic objects `new String` creates and
    %String.prototype% itself; every other primitive wrapper owns no
    property at all, so
    enumerating one is enumerating its prototype, which makes a symbol
    subject enumerate %Symbol.prototype% and a number, boolean, or
    BigInt subject report nothing. An Array's `length` and a function's
    `prototype` enter collection as non-enumerable own shadows. The
    admitted heads are a
    `var`, `let`, or `const` identifier declaration, whose lexical form
    creates its environment before the subject runs and a fresh cell per
    iteration, and an assignment target the profile already represents:
    an identifier, including one resolved through `with`, an ordinary or
    computed property, a private member, and a `super` property, whose
    receiver read, key expression, and deferred `ToPropertyKey` all
    follow the step that produced the key. M5a Unit 8.5m adds the object
    pattern head, recorded below. Deliberate boundaries, each
    rejected with a source-located diagnostic: an array pattern head, in
    declaration and assignment form alike; Annex B's head initializer; a
    multi-declarator head; and a
    strict `with` fallback write, which keeps the M5a Unit 8.5i
    rejection, while a non-strict one records its name so that unit's
    `typeof` fold stays rejected for it. The statement lowers to one
    owned acquisition and one owned step with no iterator operation and
    no finalizer, identically under both specialization policies, and
    advances the runtime ABI to `oseo-runtime-m5-43` with
    `oseo_enumerate_get` and `oseo_enumerate_next` over a new traced
    enumeration record. Fixed *for-in* and *for-in-enumeration* native
    differential fixtures cover the head forms, subjects, transfers, and
    every enumeration rule above, including a suspension inside a
    generator and an asynchronous function body, and a generated property
    with seed `0x60001500` compares a generated prototype chain, subject,
    head form, and mid-enumeration mutation against an independent
    transcription of the specified rules. One hundred twenty-four newly
    reviewed test262 cases contribute 33 passes, 63 expected negatives,
    and 28 unsupported prerequisites, and two existing entries are
    promoted to passes.
 -  The object pattern `for-in` head, admitted by M5a Unit 8.5m in both
    its `ObjectBindingPattern` declaration and `ObjectAssignmentPattern`
    assignment forms. The enumeration is unchanged: the same acquisition,
    the same step, the same skipped nullish subject, and the same absent
    close, with the head reusing the recursive destructuring the profile
    owns for standalone declarations, for-of heads, and destructuring
    assignments rather than adding a second pattern implementation. A
    `let` or `const` head creates every bound name of the pattern before
    the subject expression runs, so the subject observes their temporal
    dead zone, and creates them again on each iteration, so a closure
    made in one iteration keeps that iteration's cells; a `var` head and
    an assignment head resolve in the surrounding environment and write
    the same cells every iteration. The pattern runs after the step that
    produced the key, so `RequireObjectCoercible` applies to the
    enumerated String key rather than to the subject. Each property then
    evaluates its name, then its target reference where it has one, then
    `GetV`, then a default only when `GetV` answered `undefined`, then
    the store; a final rest property snapshots the key's own enumerable
    string keys and excludes every name evaluated before it. Because
    `ToObject` of the key stays modeled, the readable values are exactly
    a String exotic object's: one enumerable own index property per code
    unit and a non-enumerable `length`. Leaves admit everything the
    profile's object patterns already admit, including nested object
    patterns, computed names, defaults, rest, and ordinary, computed,
    private, and `super` targets, whose receiver read precedes the key
    expression and whose `ToPropertyKey` follows the value. Any abrupt
    completion in the head, including a poisoned computed name, an
    abrupt `GetV`, a nullish nested pattern input, and a failed store,
    leaves the loop through the enclosing transfer, because an enumerate
    head has no iterator to close. Labels, `with`-resolved leaves, and
    the strict and non-strict fallback-write boundaries behave exactly as
    they do for a direct head target, and a pattern subexpression may
    `await` wherever the M5a Unit 8.3 pattern positions may, which is a
    body that owns a traced suspension frame; a module top level keeps
    that unit's rejection for the same position. Deliberate boundary,
    rejected with
    a source-located diagnostic: every array pattern position, both the
    head's own form and one nested below an admitted object head. The key
    is always a String and this realm creates no string iterator, so an
    array pattern reached from a for-in head could only report a
    `TypeError` where ECMA-262 destructures the key's code units. Owned
    syntax can still represent the nested form as an ordinary recursive
    leaf, so HIR construction repeats that rejection for every frontend.
    A reserved word used as a binding name in the head stays the early
    error it already is and is reported first. Nothing
    else about the statement changes: the lowering adds no MIR operation,
    no runtime entry point, and no ABI change, and both specialization
    policies emit the same operations. A fixed *for-in-object-patterns*
    native differential fixture covers the four head forms, computed name
    order, defaults, rest exclusions, nested patterns, member, private,
    and `super` leaves, nullish, primitive, and string subjects, abrupt
    names and nested inputs, per-iteration closure identity, labeled
    transfers, a `return` through `finally`, a `with`-resolved leaf, the
    head temporal dead zone, a read-only strict target, and suspensions
    in a generator and an asynchronous function, and a generated property
    with seed `0x60001400` compares generated head shapes against an
    independent transcription of ForIn/OfBodyEvaluation's destructuring.
    The applicable-test inventory holds no executing case for this head;
    its fifteen applicable cases are early errors that stay expected
    negatives, and the seven cases that record the array pattern head
    boundary keep their `unsupported-profile-feature` classification.
 -  The `do-while` statement, lowered body-first with the same loop, join,
    `break`, and `continue` structure as `while`. `continue` re-enters the
    loop through the condition, and a body that always completes abruptly
    leaves the condition unreachable rather than approximated.
 -  The `in` and `instanceof` relational operators. `in` converts its key
    through the shared property-key conversion and walks the prototype
    chain with the same visibility as generic property reads, and
    `instanceof` implements `OrdinaryHasInstance` without well-known
    symbols, which the profile does not admit yet. `in` walks the same
    ordinary intrinsic prototype chain as a property read, so it reports an
    array's `push` and a generator prototype's `throw`; M5a Unit 8.5l
    moved that table beside the read and corrected those two names, which
    the `in` operator's own copy had been missing. Non-object `in` right
    operands, non-callable `instanceof` right operands, and non-object
    `prototype` values throw catchable `TypeError` instances.
    The private `#name in object` form resolves the name lexically and checks
    for its field, method, or accessor without reading or invoking the element.
    A fixed *class-private-in* native differential fixture and a generated
    property with seed `0x60000b02` cover per-evaluation identity, instance and
    static placement, every private element kind, unbranded objects,
    non-object `TypeError`, evaluation order, both specialization policies,
    and forced collection on the enabled path against Node.js and Deno.
    Nineteen reviewed test262 cases cover its runtime behavior and early
    errors.
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
    Node.js, Deno, and native evidence uses seed `0x60002b00` for empty,
    simple, multiple, nested, and raw-versus-cooked forms under both
    specialization policies and forced collection. Fourteen of the 25
    reviewed cases under *test/language/expressions/tagged-template/* pass
    once M5a Unit 8.1d moves the top-level `this` case from unsupported to
    pass, and two more once M5a Unit 8.5h resolves the `arguments` their
    argument lists read; the nine cases that remain unsupported retain
    independent dynamic-source, realm, tail-call optimization, and `Array`
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
    [ADR 0022](./adr/0022-async-context-boundary.md). M5a Unit 8.3 admits the
    binding-pattern subexpressions recorded below. Top-level module await uses
    its own private traced frame, with the pattern-position boundary recorded
    below. Fixed native evidence
    covers evaluation order, nested and loop positions, abrupt completion,
    awaited cleanup, heap locals across suspension, both specialization
    policies, false hints, a deliberate guard miss, and forced collection. A
    generated property with seed `0x60000600` compares an independent model,
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
    A simple catch parameter may share a name with one of these declarations,
    as M5a Unit 8.5c records below, and so may a block-level function
    declaration whose block does not lexically contain the var declaration,
    as M5a Unit 8.5d records below. Deliberate boundaries, each rejected with
    a source-located diagnostic: `export var`, ambient `declare`
    declarations, a recursive catch pattern sharing a var name, and a `var`
    that lexically shares the block declaring a same-name function, which
    stays the one collision ECMA-262's Block early errors forbid. This entry
    previously also recorded an awaited initializer
    in a `var` list with more than one declarator as a rejection. M5a Unit
    8.5a re-measured every such form in an asynchronous function and at
    module top level and found all of them admitted, so the stale
    rejection is removed rather than reworded. A top-level Script `var`
    binding is also a cell-backed own property of the realm's global this
    value, as M5a Unit 8.1d records below. `globalThis` and the complete global
    object remain outside the profile, and that gap entry owns the remaining
    Global Environment Record behavior.
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
    `0x60002400` covers the same forms across both specialization policies and
    forced collection. Sixteen reviewed test262 cases pass and twelve
    expected negatives retain the tagged-template, assignment-target, update,
    and invalid `super()` grammar errors. Four unsupported cases record
    independent prerequisites including dynamic source, restricted
    asynchronous `await` positions, `Reflect`, and
    regular expressions; the group holds twenty-one passes since M5a Unit
    8.5l promoted its `for-in` iteration-statement case and the M5b
    `string-intrinsic` node promoted its `String` one. Optional calls through
    `super` properties are admitted by M5a Unit 8.2 as recorded below. The
    remaining directory case stays outside the reviewed subset because its
    async function reaches `.call` through a function-intrinsic path that is
    not materialized yet.
 -  The `delete` operator for identifier, non-reference, ordinary member, and
    optional-chain operands. A resolved declarative identifier returns `false`
    without reading its cell, including while that cell is uninitialized; an
    unresolvable name returns `true`, including top-level `arguments` in a
    non-strict Script with no global binding, and inside an arrow function
    with no enclosing function form. Every other function form's implicit
    `arguments` object is a resolved binding and returns `false`. A
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
    an early error. Deleting a `super` property is admitted separately below.
    Deleting a runtime-owned intrinsic identifier also stays
    invalid until the global-object model can make the deletion affect later
    name resolution. Fixed Node.js, Deno, and native fixtures cover both Script
    modes, effects, abrupt completion, live and nullish paths, a false hint, a
    deliberate property-guard miss, both specialization policies, and forced
    collection. A directly generated property uses ordinary seed `0x60000f00`
    and 16 cases across the same domain; the extended gate uses seed
    `0x5eed0003` and runs 160. Twenty-six applicable reviewed test262 cases pass
    and two strict identifier cases are expected parse negatives.
 -  `delete super.property` and `delete super[expression]`, admitted by
    M5a Unit 8.5j wherever a `super` property reference itself is admitted.
    ECMA-262 evaluates the operand before rejecting it, so the whole
    reference runs and then raises a `ReferenceError`. The receiver is read
    first, so a reference inside a derived constructor before `super()`
    reports the uninitialized `this` binding and never evaluates the key
    expression. The key expression then runs for its value and its abrupt
    completion, so a key that throws reports its own error. `ToPropertyKey`
    is never reached, so a key object is never asked for a string. No lookup
    starts, so the home object's `[[Prototype]]` is never read and nothing is
    deleted, whether or not the parent owns the named property. The lowered
    program holds one rejection operation with no `super-base`,
    `delete-object-coercible`, or key-conversion operation, and both
    specialization policies emit it unchanged. Deliberate boundaries: a class
    body without `extends` and an object literal method keep the
    source-located `super` rejection recorded below, a destructuring
    assignment target and a `for` head keep theirs, private-member deletion
    stays an early error, and an optional chain whose base is a `super`
    property still deletes its final ordinary reference. Both reference hosts
    evaluate the key before the receiver in a derived constructor, which
    test262 rejects; frontend structural tests and the reviewed subset pin
    the specified order, while the fixed *class-super-delete* native
    differential fixture and the generated property with seed `0x60000e00`
    keep the derived-constructor case to keys with no observable evaluation
    so their Node.js and Deno comparisons stay exact. The fixture and the
    property cover every element form carrying a home object, static, pure
    computed, side-effecting, abrupt, and poisoned keys, an awaited and a
    yielded key whose traced suspension the evaluated receiver survives,
    present and absent parent properties, both specialization policies, and
    forced collection.
    This unit advances the runtime ABI to `oseo-runtime-m5-42` with
    `oseo_super_property_delete`. Five reviewed test262 cases are added: two
    pass and three record the `Object` heritage, extends-free class body, and
    object literal `super` boundaries this unit does not change.
 -  `super.property` and `super[expression]` as an assignment target,
    admitted by M5a Unit 8.5k wherever a `super` property reference itself
    is admitted. The target positions are every destructuring assignment
    leaf the grammar reaches, which is an array element, an object
    property, a nested array or object pattern, an element or property
    default, an array rest element, and an object rest property, together
    with a for-of and a for-await-of head, both as the head's own target
    and inside a head assignment pattern. Each position evaluates the
    reference and holds it until PutValue stores through it, so the
    admitted representation is the same receiver-carrying pair an ordinary
    `super` assignment already lowers rather than an already-read object.
    Timing follows ECMA-262 exactly. An `AssignmentElement` evaluates its
    target before the iterator step that supplies the value, and an
    `AssignmentProperty` evaluates its property name, then the target, then
    the value; a for-of head evaluates its target once per iteration, after
    the step that produced the value. Inside the reference the receiver is
    read first, so a target before `super()` in a derived constructor
    reports the uninitialized `this` binding and never runs its key
    expression, and the home object's `[[Prototype]]` is read after the key
    expression. `ToPropertyKey` belongs to PutValue, so a key object is
    converted only after the stored value exists. The store is `Set` with a
    distinct receiver: a setter found on the base chain runs against the
    enclosing element's `this`, and a target that reaches no setter defines
    an own writable, enumerable, configurable property of that receiver
    while the parent object is unchanged. A read-only parent property
    reports a `TypeError`, because a class body is strict, and a home
    object whose `[[Prototype]]` is null reports the `TypeError` the store
    itself raises rather than a separate `RequireObjectCoercible`. An
    abrupt reference is an abrupt destructuring or loop step, so an
    unfinished array pattern iterator is closed and a for-of head closes
    the loop's iterator, through `AsyncIteratorClose` under `for await`;
    an abrupt target inside a head pattern closes the pattern's iterator
    and then the loop's.
    Both stores lower to the ordinary `super` property set operation with
    its receiver argument, so the profile adds no operation, no runtime
    entry point, and no ABI change, and both specialization policies emit
    the same store. Deliberate boundaries: a class body without `extends`
    and an object literal method keep the source-located `super` rejection
    recorded below, a private name on `super` stays an early error,
    `super?.x` and a declaration pattern such as
    `for (const [super.x] of it)` stay parse errors the bootstrap parser
    reports. M5a Unit 8.5l admits the same target in a for-in head and
    M5a Unit 8.5m inside that head's object pattern, both recorded below. A
    fixed *class-super-targets* native differential fixture covers every target
    position, dot, computed, symbol, and parenthesized references, an arrow, a
    getter, a setter, a static method, a static block, a field initializer, a
    generator, an asynchronous method, an asynchronous generator, a derived
    constructor before `super()`, a parent setter, an own property the store
    defines, a read-only parent property, a null home object prototype, a
    property name evaluated before the target reference whose `GetV` follows
    it, a target reference that runs before the iterator step and a key
    conversion that runs after it, and every `IteratorClose` and
    `AsyncIteratorClose` the specified order performs, from an abrupt direct
    head, an abrupt head pattern, and an abrupt leaf, over tracked synchronous
    and asynchronous iterables, across both specialization policies and forced
    collection. A generated property with seed `0x60002a00` draws one of ten
    element forms and one of ten target positions against static, pure
    computed, side-effecting, abrupt, and poisoned keys and a parent setter,
    parent data property, or absent property, and checks the key-evaluation
    log, the stored value, and the receiver and parent property state against
    an independent oracle alongside Node.js and Deno references. The evaluation
    order the log cannot observe is pinned by the frontend structural tests and
    the fixed fixture instead. The applicable-test inventory holds no case that
    writes a `super` property from a destructuring pattern or a loop head, so
    the subset newly reviews the six applicable cases that pin the two families
    this unit joins. Four pass: the `super` assignment reference whose deferred
    `ToPropertyKey` every added position shares, and the for-of head target,
    its destructuring form, and the `IteratorClose` an abrupt target performs.
    Two record the extends-free class body boundary this unit does not change.
    The reviewed feature list adds `destructuring-assignment`, which no other
    reviewed case declares.
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
    differential fixtures and a generated property with seed `0x60000c00`
    cover all 15 operators, both target forms, short-circuiting, reference and
    conversion counts, both specialization policies, and forced collection.
    An ordinary asynchronous function retains the reference and current value
    in its traced frame when the right operand awaits. Module top level uses
    its private traced frame for the same position; only the pattern-position
    module await gap recorded below remains.
 -  Prefix and postfix `++` and `--` for identifiers and static or computed
    member references. Each form reads once, coerces through the admitted
    Number path, adds or subtracts one, and performs a checked write. Prefix
    forms produce the assigned value; postfix forms produce the coerced
    previous value. A member target evaluates its object and key expression
    once, then converts the retained raw key separately for the read and write,
    so the conversions may select different properties. Immutable targets keep
    their catchable write errors after coercion. Native differential fixtures
    and a generated property with seed `0x60002e00` cover both operators,
    both result forms, both target forms, numbers, numeric strings, booleans,
    null, reference and conversion counts, both specialization policies, and
    forced collection, including suppression of key conversion for a nullish
    base. Four reviewed test262 cases cover the four forms, two expected parse
    negatives retain strict `arguments` early errors, and the newly admitted
    classic `for` update promotes an exponentiation case to pass. M5a Unit
    8.5h adds four further expected negatives covering `arguments` as a
    prefix and postfix update target in strict code. M5a Unit 8.1a extends the
    same update path to exact BigInt values.
 -  The named error intrinsics `Error`, `AggregateError`, `EvalError`,
    `RangeError`, `ReferenceError`, `SyntaxError`, `TypeError`, and `URIError`
    as real runtime-owned constructor values. An unshadowed reference to one
    of these names resolves to the lazily created intrinsic; a lexical,
    `var`, parameter, or imported binding shadows it as ECMAScript requires.
    Each constructor is callable and constructible, installs the hidden own
    `message` property from a present message argument, honors the ES2022
    `cause` option, and exposes `name`, `message`, and `constructor` on its
    prototype, with one shared `Error.prototype.toString`. `AggregateError`
    consumes its first argument with `IterableToList`, preserves iteration
    order in a fresh own `errors` array, and installs `message` and `cause`
    before acquiring that iterator. Runtime semantic errors, TDZ reads and
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
    error identity. A directly generated property with seed `0x60002f00`
    covers arrays and custom iterables, message and cause variants, ordering,
    both specialization policies, and forced collection against independent
    Node.js and Deno observations. Fixed native differential evidence covers
    every error constructor, iterable failures, descriptor shape, and the
    deliberate absence of a specialized guard path. Fifteen reviewed test262
    cases under the AggregateError, Error, and NativeErrors inventory roots
    pin the standards surface.
 -  Generic `ToPrimitive` for object operands, implementing
    `OrdinaryToPrimitive`: user-reachable `valueOf` and `toString` run in
    hint order with the receiver, an object result falls through to the next
    method, and an object with neither convertible method throws a catchable
    `TypeError`. Whichever method the ordinary lookup finds is the one
    called, so an object whose nearest `toString` is the materialized
    `%Object.prototype.toString%` renders through that function's builtinTag
    and `Symbol.toStringTag` composition. Arrays retain a deferred
    conversion selected by intrinsic identity rather than by calling the
    materialized `Array.prototype.toString` the `array-prototype-copying`
    node admitted: the `join`-based array text with element `ToString`,
    nullish
    holes as empty elements, honored user `join` overrides, cyclic
    references rendered as empty elements, and nesting bounded by the
    deterministic call-depth budget. An object inheriting
    `Function.prototype.toString` without being callable throws the
    catchable `TypeError` that method requires. A user `Symbol.toPrimitive`
    method, reachable once the program has touched the `Symbol` intrinsic,
    is dispatched first with the specification hint string; a non-callable
    non-nullish method and an object result throw catchable `TypeError`
    instances. The conversion feeds numeric coercion, string conversion,
    addition with the default hint on both operands before the string test,
    relational comparison with the number hint in source order, loose
    equality, property keys, `console.log`, error message and
    `Error.prototype.toString` conversion, and `setTimeout` delays through
    one shared implementation, replacing both the former unsupported
    object-coercion boundary and the timer-only ad-hoc conversion.
    Deliberate Function text uses the frontend-retained source for user code
    and the native-function form for built-ins and bound functions.
    `@@toPrimitive` dispatch is implemented by the symbols unit. Native
    differential fixtures, runtime C fixtures, and reviewed test262 cases
    cover the conversion.
 -  `%Object.prototype%` is the realm-owned default prototype of ordinary
    objects. Its own `hasOwnProperty`, `isPrototypeOf`,
    `propertyIsEnumerable`, `toString`, `toLocaleString`, `valueOf`, and
    `constructor` properties have the standard writable, non-enumerable, and
    configurable descriptors. The six methods have stable identities,
    standard names and lengths, and are non-constructible. Own-property and
    enumerability queries perform `ToPropertyKey`; prototype tests traverse
    ordinary prototype chains; `toString` honors a string
    `Symbol.toStringTag`; `toLocaleString` invokes an object's current
    `toString`; and `valueOf` returns its object receiver. The constructor
    identity links back to this prototype, while its callable behavior and
    primitive wrapper objects remain owned by the later
    `object-constructor-and-wrappers` node. Fixed and generated Node.js, Deno,
    and native differential evidence covers both specialization policies,
    forced collection, descriptors, symbol keys, prototype identity, and a
    deliberate shape-guard miss. The generated domain uses stable seed
    `0x60003200`. All 179 paths under the node's sole reviewed test262 root are
    classified: 58 pass and 121 retain explicit prerequisite boundaries.
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
    complete edition set of thirteen well-known symbols is present:
    `Symbol.asyncIterator`, `Symbol.hasInstance`,
    `Symbol.isConcatSpreadable`, `Symbol.iterator`, `Symbol.match`,
    `Symbol.matchAll`, `Symbol.replace`, `Symbol.search`, `Symbol.species`,
    `Symbol.split`, `Symbol.toPrimitive`, `Symbol.toStringTag`, and
    `Symbol.unscopables`. Each property has a stable identity, is distinct
    from every other entry, has the description `Symbol.<name>`, and is
    non-writable, non-enumerable, and non-configurable. The generated property
    suite uses seed `0x60003000`, an independent table oracle, both
    specialization policies, and forced collection. `Symbol.toPrimitive`
    methods participate in generic `ToPrimitive`. Deliberate boundaries:
    adding an identity does not admit the corresponding consuming algorithm.
    `Symbol.for`, `Symbol.keyFor`, `Symbol.prototype` methods including
    `toString` and the `description` accessor, and `Symbol.hasInstance`
    dispatch in `instanceof` remain outside the profile until their
    prerequisites land. `Object.prototype.toString` now observes a string
    `Symbol.toStringTag`. Multiple realms are unavailable, so cross-realm
    well-known-symbol identity remains an owned unsupported dependency.
 -  The synchronous iterator protocol. `GetIterator` reads a value's
    `Symbol.iterator` method and calls it, throwing a catchable
    `TypeError` for a non-iterable, a non-callable method, or a
    non-object iterator. `IteratorStep` calls the iterator's `next`
    method, validates the result is an object, and reads its `done` and
    `value` fields; `IteratorClose` calls a present `return` method,
    preserving an in-flight error over a throwing or non-object return
    result. A default array exposes a first-class array iterator
    through the realm-owned `%Array.prototype%`: the iterator is an
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
    computed ordinary member or private member target, or an array or object
    assignment pattern whose leaves are existing targets. Transparent
    parentheses around existing identifier and ordinary member targets are
    normalized before classification.
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
    seed `0x60001700` cover all three declaration kinds, array and object
    values, defaults, rest, nullish failure, fresh cells, both specialization
    policies, and forced collection. Assignment patterns preserve the same
    defaults, rest, member-reference evaluation, and inner-before-outer cleanup
    as standalone destructuring assignment. Native differential fixtures and a
    generated property with seed `0x60001600` cover array and object patterns,
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
    specification reaches by boxing, is unsupported and remains M5b work; the
    promise combinators,
    `for-of`, array spread, call spread, constructor spread, and array binding
    declarations accept only
    object iterables. M5a Unit 8.5h makes `%Array.prototype.values%` and the
    array iterator's `next` generic over object array-likes, because both
    arguments object shapes now expose the same function through
    `@@iterator`: `next` takes its bound length as
    `ToLength(ToNumber(Get(O, "length")))` and each element through an
    ordinary `Get`, so an inherited or accessor property is observed and its
    abrupt completion propagates, while an ordinary array keeps its own
    element count as an equivalent fast path. Any object array-like is a
    reachable receiver, not only an array or an arguments object: admitted
    syntax can store `[][Symbol.iterator]` as an ordinary property and
    invoke it as a method, which preserves the receiver without
    `Function.prototype.call`. A primitive receiver, which the
    specification reaches by boxing, stays unsupported. Array and
    string iterator prototype identity remain outside the admitted syntax.
 -  Call and constructor argument spread. A call or construction containing
    spread evaluates its target first, then accumulates ordinary arguments and
    spread iterator values from left to right in a rooted private argument
    list. Iterator acquisition, step, value, and append failures do not call
    `IteratorClose`, and an abrupt spread stops later arguments and invocation.
    Intrinsic, method, dynamic call, and ordinary construction paths share
    this representation, and `new Promise` is one of those ordinary
    constructions; invocations without spread retain fixed positional
    arguments. Dynamic arity does not bypass admitted
    intrinsic contracts, so `Object.create(...values)` reaches the same
    prototype validation and descriptor collection the M5b `object-create`
    node admits for fixed positional
    arguments. A spread preceding a later top-level await point
    retains the accumulated argument list in the traced module continuation.
    Native differential fixtures, generated Node, Deno, and
    native properties under both specialization policies and forced collection,
    and MIR structural tests cover the dynamic-list path. Ten reviewed test262
    cases pin iterator acquisition and step failures across calls and
    construction. Call and constructor spread inherit the object-iterable
    boundary.
 -  Lexical declaration lists. A `const` or `let` declaration binds any number
    of declarators, and every declarator form the one-declarator statement
    already admitted is admitted in a list: an identifier with or without an
    initializer, a recursive array or object pattern, and a TypeScript
    annotation on each declarator separately. The frontend keeps the list as
    one owned declaration and the compiler expands its declarators into the
    statement list that contains the declaration, because ECMAScript admits a
    lexical declaration only where a StatementList is admitted and gives the
    declarators the scope that contains them. A block would create a lexical
    scope the source does not have and would reset the declared cells a second
    time, so a closure made between the two resets would observe a different
    cell. Every name of the list therefore enters its temporal dead zone before
    the first initializer runs, initialization is left to right, an abrupt
    initializer stops the list and leaves the names after it uninitialized,
    each pattern closes its own unexhausted iterator in declarator order, and a
    duplicate name inside a list or against its enclosing scope stays an early
    error. Lists are admitted in every statement list the profile already
    admits, including script and module top level, block statements, function
    and arrow bodies, class static blocks, switch clauses, and `export` at
    module top level, where the declaration exports every name it binds. An
    initializer may await in an asynchronous function, an asynchronous arrow,
    an asynchronous generator, and at module top level. Fixed Node.js, Deno,
    and native fixtures cover ordering, both temporal dead zone shapes, abrupt
    completion, mixed pattern and identifier declarators, iterator close order,
    per-iteration loop cells, switch clauses, class static blocks, awaited
    declarators, a false hint reaching the compiled generic fallback, both
    specialization policies, and forced collection. A generated property with
    seed `0x60001d00` compares an independent model, Node.js, Deno, and both
    native specialization policies across one list of two to four declarators
    per case in five statement-list positions. Seventy-eight reviewed test262
    cases pass, twenty nine record the parse negatives that keep a lexical
    declaration out of a single-statement position and a `const` declarator
    without an initializer, and five record for-await-of destructuring cases;
    M5a Unit 8.5h promotes three of those five to pass, leaving two whose
    remaining prerequisite is `Object` as a value.
 -  Array binding declarations. A `const` or `let` declarator
    and each declarator in a standalone `var` statement admit empty
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
    boundaries. `export var` remains a module-syntax boundary; M5a Unit 8.3
    later admits `await` inside a default, as recorded below.
 -  Object binding declarations. A `const` or `let` declarator
    and each declarator in a standalone `var` statement admit static,
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
    generated property with seed `0x60002000` cover values, temporal dead zones,
    function-name inference, computed and default order, symbol keys, primitive
    inputs, nullish failure, both specialization policies, and forced
    collection. A final identifier rest target snapshots own keys in ECMAScript
    order, excludes each evaluated static, computed string, or computed symbol
    key, skips non-enumerable and inherited properties, and creates writable,
    enumerable, and configurable data properties on a fresh object. A second
    generated property with seed `0x60002200` covers `const`, `let`, and `var`,
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
    unsupported boundaries. `export var` remains a module-syntax boundary;
    M5a Unit 8.3 later admits `await` inside a property name or default, as
    recorded below.
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
    `0x60002600`, `0x60000d00`, `0x60002900`, and `0x60002700` cover both
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
 -  The implicit `arguments` object. M5a Unit 8.5h gives it to every
    ECMA-262 function form that owns one: ordinary functions and function
    expressions, object and class methods, class constructors including the
    implicit and implicit derived ones, synchronous generators, asynchronous
    functions, and asynchronous generators, in strict and non-strict code
    alike. Only an arrow and an async arrow declare none of their own; their
    `arguments` reference resolves lexically to the nearest enclosing owning
    form's binding, and one with no such enclosing form keeps the ordinary
    source-located unresolved-binding diagnostic, which is also what a
    Script or module top-level reference reports.
    HIR and MIR carry one implicit binding identity, and the generated
    function prologue initializes its cell from the generic call ABI before
    parameter initialization, so a suspended generator, asynchronous
    function, or asynchronous generator observes the object its call
    created rather than one built at resumption. M5a Unit 8.5g selects
    between two shapes
    by ECMA-262's `IsSimpleParameterList`, computed once at the frontend
    boundary and carried on `SyntaxFunction` as `simpleParameterList`: no
    rest parameter, no binding pattern, and no initializer. A non-strict
    function with a simple parameter list receives the mapped arguments
    exotic object
    (`CreateMappedArgumentsObject`, 10.4.4.7). Every supplied index that is
    the rightmost formal parameter of its name stores that parameter's own
    binding cell as its property's slot value, so the existing
    `cell_backed_property` gate, already shared by the global object and a
    module namespace, routes `[[Get]]`, `[[Set]]`, and `[[GetOwnProperty]]`
    through the cell: a later mutation through either the index or the
    parameter observes the other. `[[DefineOwnProperty]]`'s redefinition
    path severs that alias exactly when the accepted descriptor is an
    explicit non-writable data descriptor or an accessor, replacing the
    cell reference with a plain snapshot of the value already written,
    while the parameter itself keeps its own cell and stays an ordinary
    mutable binding; deleting a mapped index severs it the same way every
    ordinary delete already does, since the property is simply gone
    afterward. A duplicate formal name maps only its rightmost occurrence;
    an earlier duplicate and an index at or beyond the parameter count keep
    the plain snapshot. Every strict function, and every non-strict one
    whose parameter list is non-simple (a rest parameter, a binding
    pattern, or a default), instead receives
    `CreateUnmappedArgumentsObject` (10.4.4.6): indexed properties snapshot
    every supplied argument, and no index ever aliases a parameter, so a
    write through either side is invisible to the other. `length` records
    the supplied count and is writable, configurable, and non-enumerable in
    both shapes, and indexed properties are writable, enumerable, and
    configurable in both. The two shapes differ in `callee`: the mapped
    object keeps the writable, configurable, non-enumerable data property
    naming the running function, while the unmapped object defines the
    non-configurable, non-enumerable poisoned accessor whose `[[Get]]` and
    `[[Set]]` are both the realm's single `%ThrowTypeError%` intrinsic, so
    reading or writing it throws a `TypeError`, redefining it throws, and
    a non-strict `delete` of it answers `false`. Both accessor slots and
    every unmapped object in the realm observe one `%ThrowTypeError%`
    identity. Both shapes also define `@@iterator` as a writable,
    non-enumerable, configurable data property whose value is the same
    `%Array.prototype.values%` function an array's own `Symbol.iterator`
    resolves to, so spreading or iterating an arguments object walks its
    indices; the shared array iterator reads a non-array target's `length`
    as `ToLength(ToNumber(Get(O, "length")))`, so an inherited or accessor
    `length` is observed, its abrupt completion propagates, and a
    fractional, string, negative, `NaN`, or infinite value produces the
    specified integral count. `%ThrowTypeError%` itself is non-extensible
    with a non-writable, non-configurable `length` and `name`; the
    `prototype` object every internal function in this profile carries
    remains a documented boundary the intrinsics stream owns. A formal
    parameter named `arguments` remains an explicit binding and suppresses
    the implicit one, in every spelling BoundNames admits: a plain formal, a
    defaulted one, an array or object binding pattern element, and a rest
    parameter, including the ones a parameter environment lowers to a
    synthetic parameter name. A body-level `var arguments` reuses that same
    binding rather than resetting it, while a body-level `let`, `const`, or
    function declaration of the name shadows or overwrites it the way
    FunctionDeclarationInstantiation's own ordering does. Every strict early
    error for `arguments` as an assignment target, binding identifier, or
    declared name is unchanged. That unit left the runtime
    ABI at `oseo-runtime-m5-41`. A generated property with seed
    `0x60000300`
    covers zero to six bounded arguments, in-range and absent indexed
    reads, writes, `length`, `callee`, fresh identity, both specialization
    policies, and forced collection; a second generated property with seed
    `0x60000301` covers one to three simple parameters, an optional
    rightmost-name duplicate, zero to five supplied arguments, a
    write/sever index, and every sever mode (none, deletion, an explicit
    non-writable redefinition, and conversion to an accessor), checked
    against an independent hand oracle alongside Node.js and Deno
    references, both specialization policies, and forced collection; a
    third generated property with seed `0x60000302` covers one owning form
    of seven, an optional enclosing strict scope, one to three simple
    leading parameters with an optional non-simple trailing formal, zero to
    five supplied arguments, a bounded write index, and optional reads
    through a nested arrow, checking mapped-versus-unmapped selection, the
    `callee` descriptor shape, snapshot independence, the arrow boundary
    diagnostic, and the explicit-parameter suppression against the same
    references and policies. Fixed
    native evidence also covers property descriptors, object methods,
    synchronous generators, two-way aliasing through both a numeric and a
    string-keyed index, an excess and an absent parameter, a duplicate
    formal name, deletion, a non-writable redefinition whose omitted value
    defaults to the current mapped value, conversion to an accessor, every
    owning form's own object, arrow and async-arrow lexical capture from an
    ordinary function, an object method, and a class constructor, the
    poisoned `callee`'s read, write, redefinition, deletion, descriptor
    shape, and non-extensibility, a body `var`, `let`, or function
    declaration named `arguments` in both the shared and the separate
    parameter environment, and iteration under a fractional, string,
    negative, `NaN`, grown, shrinking, infinite, inherited, and abrupt
    `length`, an abrupt element accessor and the index the following step
    reads, a `length` accessor that reenters the same iterator, and a
    borrowed `%Array.prototype.values%` invoked as a method on an ordinary
    array-like with own and inherited indices.
    248 reviewed test262 cases from *test/language/arguments-object/*,
    247 of them passes and one an expected negative,
    cover empty calls despite formal parameters, `callee` identity,
    descriptors, and poisoning, writes, deletion, iteration, mapped index
    descriptor shape, non-configurable and non-writable redefinition
    transitions in every order, severing through `[[DefineOwnProperty]]`
    and through deletion, conversion to an accessor, and one call-site
    trailing comma in every admitted function form. 106 further reviewed
    cases across *test/language/expressions/* and
    *test/language/statements/* cover lexical capture from an arrow,
    parameter-default references, `for-of` over both shapes, `var` and
    function declarations named `arguments`, and the strict early errors
    that keep the name off every assignment target.
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
    generated property with seed `0x60000a00` cover array and object values,
    defaults, rest, nullish failure, both specialization policies, and forced
    collection. Sixteen reviewed test262 cases cover array values, defaults,
    function-name inference, nested rest, object nullish failure, trailing
    properties, and object rest descriptors. TypeScript pattern annotations
    remain outside the ECMA-262 claim; M5a Unit 8.3 later admits `await`
    inside a property name or default, and M5a Unit
    8.5b later admits the clause without any parameter, as recorded below.
 -  Optional catch binding. M5a Unit 8.5b admits a `catch` clause without a
    CatchParameter. The clause discards the thrown value, creates no
    catch-parameter environment, and runs its block with the block's own
    lexical scope, so a shadowing `let` declares a fresh cell per entry and a
    `var` declaration hoists to the enclosing function or script exactly as a
    parameterized clause allows. Strictness, closure identity, abrupt
    completion, `return`, `throw`, `break`, and `continue` through `finally`,
    and nested `try` statements keep the completion precedence the
    parameterized form already proved, because MIR still consumes the pending
    completion to clear the error context and simply leaves the thrown value
    unused. The owned syntax represents the absent parameter explicitly, a
    nullish handler pattern from a custom frontend normalizes to that absent
    form, and a handler without a body is a source-located diagnostic.
    Parameterized catch clauses are unchanged. A fixed native fixture covers
    body entry for every thrown value including `null`, a skipped handler on
    normal completion, shadowing, fresh cells across repeated entries, `var`
    hoisting, `return` and override precedence through `finally`, labeled
    `break` and `continue`, a rethrow reaching an outer handler, generator
    yields inside the clause, and an awaited recovery, under both
    specialization policies with forced collection. The pre-existing
    `0x60000a00` generated domain of array and object catch bindings is
    unchanged; a distinct `0x60002300` generated domain covers absent and
    destructured catch handlers with rethrown completions, optional
    finalizers, and present, missing, and nullish thrown inputs. Seven
    reviewed cases enter:
    *optional-catch-binding.js*, *optional-catch-binding-finally.js*, and
    *optional-catch-binding-throws.js* pass in both strictness modes;
    *optional-catch-binding-parens.js*, *S12.14\_A16\_T6.js*, and
    *block/12.1-2.js* are expected parse negatives that keep `catch ()` and a
    catch-less `try {};` rejected; and *optional-catch-binding-lexical.js*
    stays `unsupported-profile-feature` because its final assertion reads an
    unresolved global name, which the global binding model gap below owns.
 -  Catch parameter and `var` coexistence. M5a Unit 8.5c admits a simple catch
    parameter sharing its name with a var-scoped declaration in the enclosing
    function, Script, or module. The outer var cell is hoisted and initialized
    normally, even when its only declaration occurs in the catch body. Each
    catch evaluation creates a distinct catch cell, and a same-name `var`
    declaration creates no additional body cell. Its initializer is an
    ordinary assignment resolved inside the catch environment, so it writes
    the catch cell and leaves the outer cell unchanged. After the clause, the
    outer value is therefore its earlier value or `undefined`. Recursive array
    and object catch patterns keep their var-name redeclaration restriction,
    same-scope lexical declarations remain early errors, and the block-level
    function and optional-catch boundaries are unchanged. Fixed Node.js, Deno,
    and native evidence covers non-strict Script code, strict and non-strict
    ordinary function bodies, modules, generator and asynchronous bodies,
    closure identity, abrupt initializers, `finally` precedence, both
    specialization policies, forced collection, and the AArch64 Linux
    cross-link. The deterministic name rule has no useful generated domain, so
    no property suite is added.
 -  Destructuring assignment with identifier, ordinary member, and private
    member targets. An assignment expression admits recursive array and object
    patterns whose leaves and rest targets name existing bindings, evaluate
    static or computed ordinary member references, or select a lexically
    resolved private name on an evaluated object. Transparent parentheses
    around identifier and ordinary member targets are normalized before
    classification. The expression evaluates the right operand once before
    pattern work and produces that original value. An ordinary member leaf
    evaluates its object and computed-key expression before the corresponding
    iterator step, source property read, or default, then converts the key and
    stores after selecting the value. A private member leaf preserves the same
    ordering and stores through the existing brand-checked private-set
    operation. Array patterns
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
    A generated property with seed `0x60001000` also covers parenthesized member
    targets, array and object inputs, defaults, rest, nullish failure, result
    identity, both specialization policies, and forced collection. Fourteen
    reviewed test262 cases add strict and non-strict evidence for identifier and
    ordinary member writes, nested patterns, defaults, rest, result identity,
    nullish and immutable target errors, and function-name inference. Focused
    frontend tests pin private destructuring and for-of targets through the
    shared private-set lowering, and five reviewed test262 cases execute those
    private targets under both specialization policies. M5a Units 8.5l and
    8.5m later cover the same target path in direct and object-pattern for-in
    heads under native differential execution, both specialization policies,
    and forced collection. Synchronous `for-of` assignment heads reuse this
    pattern and target contract. TypeScript pattern annotations remain outside
    the ECMA-262 claim; M5a Unit 8.3 later admits `await` inside a source
    property name, default, or ordinary member target, as recorded below.
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
    `0x60002100` covers zero to four data, shorthand, method, getter,
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
    permanently; that intrinsic owns `next` and `return` and inherits
    `Symbol.iterator`, so all three resolve through the specified
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
    exists as a reachable object with ordinary own methods, and
    `%GeneratorFunction%` and `%GeneratorFunction.prototype%` are not
    materialized at all. ECMAScript exposes no `GeneratorFunction` global
    binding, so
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
    an inner generator as well. A generated property with seed `0x60001c00`
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
    with seed `0x60001a00` uses an independent call-time initialization oracle
    over both generator kinds, both recursive pattern kinds, missing, present,
    `undefined`, and `null` inputs, both specialization policies, truthful and
    false JSDoc and TypeScript hints, deliberate guard misses, and forced
    collection on the enabled path. Four hundred thirteen reviewed test262
    cases move from unsupported to passing while the other reviewed
    generator-parameter cases retain their independently observed
    classifications.
    A generated property with seed `0x60001b00` covers caught and uncaught
    throw resumptions, and one with seed `0x60001900` covers generator methods
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
    unsupported cases that at that checkpoint needed `arguments`, the
    `Boolean` intrinsic, or an unresolvable reference. `arguments` has since
    landed; the intrinsic and global-name dependencies retain their M5b owner.
    The fourteen `star-rhs-iter-thrw-*` and `star-throw-is-null` cases have not
    yet entered the reviewed subset and remain M5c inventory work, and
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
    closure at run time. Both named and anonymous `export default class`
    declarations are admitted.
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
    generated property with seed `0x60000b00` covers class declarations,
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
    or `arguments` property remain outside this node's reviewed promotion
    root. Their owning class family must review them separately now that
    `Object.prototype.hasOwnProperty` exists.
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
    two `grammar-special-prototype-accessor-meth` cases remain outside this
    node's reviewed promotion root and await their owning class-family review.
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
    untouched, unlike the prototype element the grammar rejects. Private
    static methods and accessors are admitted by the later private-element
    unit. Native
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
    a class body without `extends` and in an object literal method. The
    materialized `%Object.prototype%` now supplies the lookup root, but the
    separate `super-without-extends` graph node still owns this syntax.
    M5a Unit 8.5j
    later admits the `delete` operand position, recorded above, which carries
    no receiver anywhere because ECMA-262 rejects the evaluated reference
    before any lookup starts, and M5a Unit 8.5k admits the destructuring
    assignment and for-of head target positions, recorded below. M5a Unit
    8.5l adds the for-in head target position, which stores the
    enumerated key through the same reference, and M5a Unit 8.5m adds the
    leaf positions of that head's object pattern.
    Native differential
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
    `fields-computed-name-propname-constructor` cases remain outside this
    node's promotion root and await their owning class-family review. The
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
    The `in` entry and the destructuring and iterator entries above record the
    evidence that admits `#name in object` and private assignment targets.
    Optional private field and accessor reads and optional private method calls,
    including `object?.#method()`, are admitted by Unit 8.5o. The optional
    guard short-circuits `null` and `undefined` before the private get or any
    method argument evaluation. A live receiver performs the ordinary private
    brand check and accessor getter call, and a private method call preserves
    that receiver as `this`. Fixed native differential fixtures cover valid
    and invalid brands, nullish short circuit, receiver preservation, truthful
    and false hints, both specialization policies, and forced collection. A
    generated property with seed `0x60002500` adds twelve ordinary cases with
    an independent oracle over field, accessor, and method operations and
    valid, invalid, `null`, and `undefined` receivers.
    `delete this.#name` remains the early error it is. Native differential
    fixtures cover private fields and their absence from every key observation,
    private methods including installation order, non- writability,
    non-constructibility, and the home object, private accessors, brand checks
    across per-evaluation identity, plain objects, uninitialized receivers, the
    prototype receiver, and a base that lacks a derived name, the pre-`super()`
    temporal dead zone, compound assignment and update operators, private state
    holding every admitted value, and a hinted method that specializes while
    private fields, a private method, and a private accessor surround it, with
    every guard path leaving those elements intact. Eighty-four reviewed
    test262 cases newly pass and three hundred sixty-six new expected negatives
    record the private name early errors, which are dominated by the
    undeclared-private-name references every class element form reports.
    Seventy new unsupported cases record this unit's boundaries. The reviewed
    manifest moves to 1,161 passes, 826 expected negatives, and 297 unsupported
    profile features with no semantic or harness failures.
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
    `0x60001200` draws asynchronous and synchronous iterator kinds, head
    forms, transfer positions, and close modes under both specialization
    policies and forced collection. Two hundred eighty-one reviewed test262
    cases newly pass, ninety new expected negatives record the head's early
    errors, and eight new unsupported cases record the asynchronous generator
    boundary this unit keeps. The reviewed subset gains the `async-iteration`
    and `Symbol.asyncIterator` feature tags, and the manifest moves to 1,511
    passes, 988 expected negatives, and 381 unsupported profile features with
    no semantic or harness failures. At this checkpoint asynchronous
    generators stayed rejected; the asynchronous generator entry below admits
    them. A
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
    property suite uses seed `0x60001f00` over structured asynchronous SCC,
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
    inherits from a lazily created `%AsyncGeneratorPrototype%`, which reaches
    ordinary `next`, `return`, `throw`, and `Symbol.asyncIterator` methods,
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
    `next`, `return`, `throw`, and `Symbol.asyncIterator`,
    non-constructibility, `throw` into
    `try`/`catch`, `return` through `finally` including a `finally` that
    awaits and one that yields, unstarted `return` and `throw`, delegation to
    arrays, synchronous generators, asynchronous generators, nested
    delegations, and a hand-written asynchronous iterator whose `return` and
    `throw` are forwarded, the missing-`throw` `TypeError`, rejected awaits
    caught and uncaught, body throws, timer-driven awaits, queued requests
    resolved in order, a misapplied method that rejects rather than throws,
    and the exact microtask interleaving of two generators against five
    chained reactions. A generated property with seed `0x60000700` draws
    bounded bodies, awaited and promised operands, three delegation kinds,
    `try`/`catch` and `try`/`finally` guards, and every resumption position
    under both specialization policies and forced collection.
    Unit 7.5 adds fixed reaction- and timer-ordered delegation fixtures plus a
    generated property with seed `0x60001201`. The property draws `for await`
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
    Generated properties with seeds `0x60001202` and `0x60001203` draw
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
    `%AsyncIteratorPrototype%` now inherits from `%Object.prototype%`, and
    `%AsyncGeneratorFunction.prototype%` and callable asynchronous generator
    functions inherit from `%Function.prototype%` through the realm intrinsic
    graph. Deliberate boundary: `%Function%` is not materialized, so
    `%AsyncGeneratorFunction%` cannot yet inherit from that constructor.
    Calling or constructing `%AsyncGeneratorFunction%` reports
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
generated property suite uses ordinary seed `0x60000800`, a 10-case ordinary
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
behavior, `BigInt.asIntN`, and `BigInt.asUintN` are outside this M5a unit. The
M5b `bigint-intrinsic` node recorded below admits them under
[*PLAN-BIGINT.md*](../PLAN-BIGINT.md). Binary-data and atomic consumers remain
with their owning built-in families.

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
miss. The directly generated property uses seed `0x60000f00`, a 16-case
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

Private-name deletion remains an early error. `delete super.property` was a
source-located invalid boundary for this unit rather than being lowered as an
ordinary property delete, because admitting it requires the runtime
`ReferenceError` and the specified receiver, key-expression, and
`ToPropertyKey` suppression order. M5a Unit 8.5j supplies all four and closes
that boundary.
Deleting `Symbol` or a named error intrinsic as an identifier remains invalid
until the global-object model can remove the property and change subsequent
name resolution consistently. At non-strict Script top level,
`delete arguments` is an unresolvable-reference delete and returns `true` when
no global binding exists, and M5a Unit 8.5h gives an arrow function with no
enclosing function form the same answer through the same unresolvable path.
Every other function form instead resolves its own implicit `arguments`
object and returns `false`, so the unit retired the separate source-located
diagnostic that reported a deliberately unavailable implicit object. Strict
identifier deletion remains an early error.
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

The generated property uses fixed seed `0x60002101` and a 16-case ordinary
budget. Its independent oracle directly generates null, object, and primitive
prototype values, all four definition positions, each permitted ordinary
`__proto__` form, inherited reads and writes versus own descriptors, effects,
abrupt completion, a false number hint and deliberate guard miss, both
specialization policies, and forced collection. The duplicate early-error
property uses seed `0x60002102` under both policies. Fixed Node.js, Deno, and
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

The later M5b `global-object-record` node completes this static declaration
boundary. The realm installs `Infinity`, `NaN`, `undefined`, and every admitted
constructor global before declaration instantiation. Script lexical names
reach HasRestrictedGlobalProperty before any mutation, and var-scoped names
reach CanDeclareGlobalFunction or CanDeclareGlobalVar against the existing
descriptor and the global object's extensibility. A `var` redeclaration
preserves the existing property and value, a restricted function or lexical
declaration throws before the statement list runs, and a missing property on a
non-extensible global is rejected before any earlier declaration can mutate
the object. Function-local and Module declarations remain ordinary
declarative bindings and do not enter this record.

The record validates one independently compiled Script at a time. It does not
retain `[[VarNames]]` or global declarative names across successive Script
instantiations in the same realm, so cross-Script declaration collisions are
outside this unit even though the runtime entry point can be called more than
once for storage-level tests.

This object is still not exposed by a `globalThis` binding. Indirect `eval`,
dynamic `Function` construction, dynamically created global names, and the
standard global values owned by later intrinsic nodes remain outside this
static record. Those boundaries preserve closed-world name resolution rather
than turning the global object into an implicit runtime name table.

Two further boundaries are worth naming. Annex B's block-level function
hoisting is not implemented, so a function declared in a block at Script top
level has no var-scoped binding and is therefore absent from the global
object; a reference to that name outside its block is already rejected with a
source-located diagnostic, but a global-object observation such as
`"name" in this` reports absence instead of diagnosing it. This holds in
strict and non-strict Script code alike, since Annex B applies only to
non-strict code and the profile never applies it: M5a Unit 8.5d admits a var
declaration that shares a block-level function's name only when the two
coexist as the ordinary disjoint bindings ECMA-262 already describes without
Annex B, never as the copied-out alias Annex B would create. Property creation
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

The generated property uses fixed seed `0x60002c0c` and a 32-case ordinary
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

The existing lexical-super property uses seed `0x60001e00`. A separate
optional-call property uses seed `0x60001e01` across one to three nested arrows,
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
classic `for` declaration heads, and `for-of`, `for-await-of`, `for-in`, and
assignment heads.

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

The generated property suite uses seed `0x60002800` across the four pattern
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

M5a Unit 8.5a admits the multi-declarator `const` and `let` declaration list
recorded above. The reviewed subset grows by 112 cases and the manifest
reaches 4,332 cases: 2,563 passes, 1,211 expected negatives, and 558
unsupported profile features with no semantic or harness failures. Eighty of
the new passes are the two reviewed cases the old rejection blocked plus
seventy-eight promotions from *language/statementList/*,
*statements/let/syntax/*, *statements/const/syntax/*, *statements/for/*, and
the *for-await-of* destructuring family whose generated preludes declare
several names in one `let`.

M5a Unit 8.5b admits the optional catch binding recorded above. The reviewed
subset grows by the seven cases a textual scan of the included inventory
finds using or naming the form: three passes, three expected parse negatives,
and one unresolved-global read that stays `unsupported-profile-feature` under
the global binding model gap. The manifest reaches 4,339 cases: 2,566 passes,
1,214 expected negatives, and 559 unsupported profile features with no
semantic or harness failures.

M5a Unit 8.5c admits the simple catch parameter and same-name `var`
coexistence recorded above. The reviewed subset adds
*test/language/statements/try/scope-catch-param-var-none.js* as inventory
evidence for retaining the existing variable environment across a catch
parameter. Its direct `eval` dependency remains outside the profile under ADR
0016, so it is recorded as `unsupported-profile-feature`; the fixed
differential fixture provides the same-name positive evidence the upstream
case does not isolate. The manifest reaches 4,340 cases: 2,566 passes, 1,214
expected negatives, and 560 unsupported profile features with no semantic or
harness failures.

M5a Unit 8.5d admits the block-level function and outer var coexistence
recorded above. The reviewed subset adds thirteen cases naming a
block-level function declaration: two passes from
*test/language/block-scope/shadowing/* for a bare block function that was
already admitted before this unit, six expected negatives from
*test/language/block-scope/syntax/redeclaration/* for the same-block and
ancestor-block conflicts the lexical-frame check keeps rejecting, and five
`unsupported-profile-feature` results, *global-code/block-decl-strict.js*,
*function-code/block-decl-onlystrict.js*, and three *eval-code/direct/*
forms, each of which expects a runtime `ReferenceError` for a reference
outside the declaring block that the frontend instead reports as a
compile-time diagnostic. The manifest reaches 4,353 cases: 2,568 passes,
1,220 expected negatives, and 565 unsupported profile features with no
semantic or harness failures.

M5a Unit 8.5e admits the switch-clause function declaration recorded above.
The reviewed subset adds nineteen cases: fifteen expected negatives from
*test/language/statements/switch/syntax/redeclaration/* for the CaseBlock
duplicate and var-overlap conflicts the shared scope keeps rejecting, and
four `unsupported-profile-feature` results, *scope-lex-async-function.js*,
*scope-lex-async-generator.js*, *scope-lex-class.js*, and
*scope-lex-generator.js*, each of which expects a runtime `ReferenceError`
for a reference outside the switch that the frontend instead reports as a
compile-time diagnostic, the same documented boundary Unit 8.5d records for
a block. The manifest reaches 4,372 cases: 2,568 passes, 1,235 expected
negatives, and 569 unsupported profile features with no semantic or harness
failures.

M5a Unit 8.5f admits the `debugger` statement recorded above. The frontend
converts it to the same `{ kind: "block", body: [] }` owned syntax the
empty statement already produces, so every later exhaustive or permissive
statement-kind dispatch in HIR construction, MIR lowering, module
traversal, and the C backend admits it unmodified, in a block, a loop, a
switch clause, a labeled statement, a function, an async or generator body,
and a module top level alike. The reviewed subset adds both included
_test/language/statements/debugger/\*_ cases: *statement.js* is a pass, and
*expression.js*, which places `debugger` in an expression position, is an
expected negative the bootstrap parser already rejects as a native
parse-time `SyntaxError`. The manifest reaches 4,374 cases: 2,569 passes,
1,236 expected negatives, and 569 unsupported profile features with no
semantic or harness failures.

M5a Unit 8.5o admits optional private field and accessor reads and optional
private method calls as recorded above. The reviewed subset adds the expression
and statement forms of *grammar-private-field-optional-chaining.js* as passes.
The two *private-field-after-optional-chain.js* forms remain
`unsupported-profile-feature` because they construct their receiver with the
M5b-owned `Object` intrinsic. No prior result moves. The manifest reaches 4,861
cases: 2,934 passes, 1,355 expected negatives, and 572 unsupported profile
features with no semantic or harness failures. The 41,091-path inventory,
suite revision, manifest schema and vocabulary, zero-override policy, and
runtime ABI `oseo-runtime-m5-43` are unchanged.

M5b node `error-aggregate-and-options` adds `AggregateError`, its iterable
`errors` list, and the `cause` option shared by every error constructor. The
reviewed subset adds fifteen passing cases under only its three inventory
roots. The manifest reaches 4,876 cases: 2,949 passes, 1,355 expected negatives,
and 572 unsupported profile features with no semantic, harness, or
infrastructure failures. The suite revision, 41,091-path inventory, manifest
schema and vocabulary, and zero-override policy are unchanged. The public
error-kind and context layouts move the runtime ABI to
`oseo-runtime-m5-44`.

M5b node `well-known-symbols` extends the realm-owned table from four entries
to all thirteen well-known symbols in the candidate edition. Fixed native
differential evidence covers every entry under both specialization policies
and forced collection. The directly generated suite uses stable seed
`0x60003000` and an independent identity, description, and descriptor oracle.
All 28 cases under the node's thirteen inventory roots are reviewed: thirteen
pass, while thirteen cross-realm cases and two `Symbol.species` prerequisite
cases remain unsupported. The node adds nine passes and fourteen honest
unsupported classifications, moving the manifest to 4,899 cases: 2,958
passes, 1,355 expected negatives, and 586 unsupported profile features with
no semantic, harness, or infrastructure failures. The suite revision,
41,091-path inventory, manifest schema and vocabulary, and zero-override
policy are unchanged. The public realm context layout moves the runtime ABI to
`oseo-runtime-m5-45`.

M5b node `intrinsic-graph-root` replaces the component-local intrinsic caches
and name-compared virtual property classification with one collector-traced
realm table. It materializes `%Object.prototype%` and the callable
`%Function.prototype%`, makes ordinary objects and functions reach those roots,
and links the admitted array, promise, iterator, generator, error, symbol, and
asynchronous-generator prototypes and constructors through ordinary property
lookup. At that node boundary, deferred `Object.prototype` and
`Array.prototype` coercions stayed as behavior-preserving fallbacks selected
by intrinsic identity. Fixed native differential evidence and the generated
array domain with seed `0x60003100` cover shared identity, explicit prototype
replacement, both specialization policies, and forced collection. The node owns
no test262 inventory roots and admits no new semantics, so all 4,899 reviewed
results and their 2,958 passes remain unchanged. The public context and
intrinsic-access ABI moves to `oseo-runtime-m5-46`.

M5b node `object-prototype` populates the existing realm root with its six
standard methods and `constructor` link. Fixed native differential evidence
and the generated domain at seed `0x60003200` cover descriptors, symbol keys,
prototype identity, both specialization policies, forced collection, and a
deliberate shape-guard miss that reaches generic lookup. All 179 cases under
the sole reviewed promotion root are classified: 58 pass and 121 remain honest
prerequisite boundaries. The manifest reaches 5,078 cases: 3,016 passes, 1,355
expected negatives, and 707 unsupported profile features with no semantic,
harness, or infrastructure failures. The suite revision, 41,091-path
inventory, manifest schema and vocabulary, and zero-override policy are
unchanged. The expanded intrinsic table moves the runtime ABI to
`oseo-runtime-m5-47` without changing the graph's orchestration state.

M5b node `function-prototype` completes the callable realm root with
`call`, `apply`, `bind`, `toString`, `Symbol.hasInstance`, the `Function`
constructor identity, and the restricted `caller` and `arguments` accessors
backed by the realm's existing `%ThrowTypeError%`. Source known to the AOT
frontend is retained for user functions, while built-ins and bound functions
use the native-function form. The dynamic-source constructor and primitive
wrapper coercion remain explicit later-node boundaries. Fixed native and
generated differential evidence at seed `0x60003300` covers both
specialization policies, forced collection, bound construction, custom
has-instance dispatch, and deliberate shape-guard misses. All 344 paths under
the node's four inventory roots are reviewed: 123 pass and 221 retain explicit
prerequisite boundaries. Two existing global-binding cases also become passes,
moving the manifest to 5,422 cases: 3,141 passes, 1,355 expected negatives,
and 926 unsupported profile features with no semantic, harness, or
infrastructure failures. The suite revision, 41,091-path inventory, manifest
schema and vocabulary, and zero-override policy are unchanged. The public
function-kind and intrinsic tables move the runtime ABI to
`oseo-runtime-m5-48` without changing the graph's orchestration state.

M5b node `iterator-intrinsic` materializes `%Iterator%`,
`%IteratorPrototype%`, `Iterator.from`, and the wrap-for-valid-iterator object
that later helper methods extend. `Iterator.from` captures `next` once,
preserves an iterator that already inherits from `%IteratorPrototype%`, and
otherwise returns a collector-traced wrapper whose `next` forwards through the
captured method and whose `return` performs a fresh lookup. The prototype's
`constructor` and `Symbol.toStringTag` accessors retain their standard
setter-that-ignores-prototype behavior. Fixed native and generated
differential evidence at seed `0x60003400` covers both specialization
policies, forced collection, direct and iterable inputs, late `return` lookup,
and deliberate shape-guard misses. All 37 paths under the node's six inventory
roots are reviewed. Their common upstream `iterator-helpers` feature tag
remains unsupported until the later helper method nodes complete that feature,
so the manifest reaches 5,459 cases: 3,141 passes, 1,355 expected negatives,
and 963 unsupported profile features with no semantic, harness, or
infrastructure failures. The suite revision, 41,091-path inventory, manifest
schema and vocabulary, and zero-override policy are unchanged. The expanded
intrinsic table and traced wrapper state move the runtime ABI to
`oseo-runtime-m5-49` without changing the graph's orchestration state.

M5b node `number-intrinsic` materializes the `Number` constructor, its
branded wrapper objects, standard numeric constants, predicate statics, and
parser statics. `Number` is also the standard writable, non-enumerable,
configurable property of the realm's global object. Fixed native and generated
differential evidence at seed `0x60003500` covers both specialization policies,
forced collection, string and BigInt conversion, wrapper construction, parser
prefixes, false numeric hints, and deliberate shape-guard misses. All 172 paths
under the node's eleven inventory roots are reviewed: 135 pass and 37 retain
explicit prerequisite boundaries for Number prototype formatting, other
primitive wrappers and constructors, global numeric aliases, and unavailable
harness capabilities. Twenty-four previously reviewed cross-family cases also
become passes because their Number prerequisites are now present. The manifest
reaches 5,631 cases: 3,300 passes, 1,355 expected negatives, and 976 unsupported
profile features with no semantic, harness, or infrastructure failures. The
suite revision, 41,091-path inventory, manifest schema and vocabulary, and
zero-override policy are unchanged. The expanded intrinsic table, branded
wrapper state, and Number component move the runtime ABI to
`oseo-runtime-m5-50` without changing the graph's orchestration state.

M5b node `object-constructor` makes `Object` a callable and constructible
global intrinsic, adds collector-traced primitive wrappers and String wrapper
properties, and implements `Object.is`, `Object.getPrototypeOf`, and
`Object.setPrototypeOf`. Fixed native and generated differential evidence at
seed `0x60003600` covers both specialization policies, collection forced at
every safepoint, false hints, guard hits and misses, generic fallback, derived
construction, primitive wrapping, prototype mutation, and global `Object`
replacement. All 139 paths under the node's five inventory roots are reviewed:
76 pass and 63 retain explicit prerequisite boundaries. A further 195
previously reviewed cases move from unsupported to pass because the real
`Object` value and its prototype operations satisfy their prerequisites. The
manifest reaches 5,770 cases: 3,571 passes, 1,355 expected negatives, and 844
unsupported profile features with no semantic, harness, or infrastructure
failures. The suite revision, 41,091-path inventory, manifest schema and
vocabulary, and zero-override policy are unchanged. The public intrinsic table
and collector-traced wrapper state move the runtime ABI to
`oseo-runtime-m5-51` without changing the graph's orchestration state.

M5b node `object-define-property` admits `Object.defineProperty` over the
existing property-key and descriptor components. It preserves the specified
target check, property-key coercion, and descriptor conversion order;
attribute defaults; data/accessor exclusivity; incompatible-change checks;
abrupt completion; and ordinary and exotic mutation. Fixed native and
generated differential evidence at seed `0x60003700` covers both
specialization policies, collection forced at every safepoint, false hints,
generic fallback, primitive targets, arrays, functions, arguments aliases,
String wrappers, symbols, and module namespace descriptor compatibility. The
reviewed property helper provides the admitted legacy descriptor verifiers, so
missing harness bindings do not count as profile gaps. All 1,131 paths under
the node's inventory root are reviewed: 965 pass and 166 retain explicit
prerequisite boundaries. The manifest reaches 6,901 cases: 4,556 passes, 1,355
expected negatives, and 990 unsupported profile features with no semantic,
harness, or infrastructure failures. The suite revision, 41,091-path
inventory, manifest schema and vocabulary, and zero-override policy are
unchanged. The completed descriptor checkpoint moves the runtime ABI to
`oseo-runtime-m5-52` without changing the graph's orchestration state.

M5b node `promise-intrinsic` makes `Promise` a materialized realm value.
The constructor is an ordinary constructible function bound as the standard
writable, non-enumerable, configurable property of the global object, so
`new Promise` is ordinary construction and every static is an ordinary
method call rather than a frontend fast path recognized by name. A promise
takes its `[[Prototype]]` from the new target; `Promise.prototype` carries
`constructor`, `Symbol.toStringTag`, `then`, `catch`, and `finally`; and
`%Promise%` carries the `Symbol.species` accessor with `resolve`, `reject`,
`withResolvers`, `try`, `all`, `race`, `allSettled`, and `any`.
`Promise.prototype.then` and `finally` run SpeciesConstructor, and a
capability over any constructor other than `%Promise%` is the record
NewPromiseCapability builds from that constructor's executor and resolving
functions, so a subclass or foreign capability observes its own settlement.
Fixed native and generated differential evidence at seed `0x60003800` covers
both specialization policies, collection forced at every safepoint, false
hints, deliberate shape-guard misses, generic fallback, subclass and foreign
capabilities, throwing and non-constructor species, and global `Promise`
replacement and deletion. `Promise.all` and `Promise.race` now build their
capability from the `this` value, and the remaining combinator behavior
stays with its own graph node. The reviewed subset admits the `promise-try`
and `promise-with-resolvers` feature tags, so both statics execute their
upstream cases instead of reporting an unadmitted feature. Of the 250 paths
under the node's seven inventory roots, 238 are reviewed: 183 pass and 55
retain explicit prerequisite boundaries. The remaining twelve name the
*promiseHelper.js* include, the
unhandled-rejection host policy, and the `PromiseResolve` constructor read.
Thirteen previously reviewed cases also move from unsupported to pass because a
real `Promise` value satisfies their prerequisites. The manifest reaches 7,111
cases: 4,750 passes, 1,355 expected negatives, and 1,006 unsupported profile
features with no semantic, harness, or infrastructure failures. The suite
revision, 41,091-path inventory, manifest schema and vocabulary, and
zero-override policy are unchanged. The materialized constructor and its
retired fast-path entry points move the runtime ABI to `oseo-runtime-m5-53`
without changing the graph's orchestration state.

M5b node `object-descriptor-queries` completes the descriptor checkpoint's
reporting half. `Object.getOwnPropertyDescriptor` and the new
`Object.getOwnPropertyDescriptors` convert their target before their property
key, so a nullish target throws before an abrupt key conversion runs, and a
primitive target reports the wrapper object it converts to, including a
String wrapper's index and `length` properties. An absent property reports
`undefined` and a target with no own property reports an empty ordinary
object whose `[[Prototype]]` is `Object.prototype`. Both statics build every
reported descriptor through one FromPropertyDescriptor body, so a data
property reports `value`, `writable`, `enumerable`, and `configurable` and an
accessor property reports `get`, `set`, `enumerable`, and `configurable`, each
in that order and as writable, enumerable, configurable data properties.
`Object.getOwnPropertyDescriptors` walks ordinary own keys: integer indices
lead in ascending numeric order, the array `length` and function `prototype`
this runtime keeps outside the property vector hold their creation positions,
and symbol keys trail every string key. Neither static invokes a getter, so a
reported accessor descriptor carries the functions themselves. A mapped
arguments index reports its parameter's current value. Fixed native and
generated differential evidence at seed `0x60003900` covers both
specialization policies, collection forced at every safepoint, false hints,
deliberate shape-guard misses, generic fallback, primitive and wrapper
targets, arrays, functions, classes, arrows, arguments objects, symbol keys,
and abrupt key conversion. Of the 328 paths under the node's two inventory
roots, 313 are reviewed: 163 pass and 150 retain explicit prerequisite
boundaries for the unadmitted `Array`, `Boolean`, `Date`, `JSON`, `Math`,
`RegExp`, and `String` globals, the `Function` constructor, `Proxy` and
`Reflect`, and `Object.getOwnPropertySymbols`. The remaining fifteen observe
the standard function and value properties of the global object and the
`Number` prototype's formatting methods, which no admitted node supplies yet.
The manifest reaches 7,421 cases: 4,910 passes, 1,355 expected negatives, and
1,156 unsupported profile features with no semantic, harness, or
infrastructure failures. The suite revision, 41,091-path inventory, manifest
schema and vocabulary, and zero-override policy are unchanged. Completing the
descriptor checkpoint's reporting half moves the runtime ABI to
`oseo-runtime-m5-54` without changing the graph's orchestration state.

M5b node `array-buffer` materializes `%ArrayBuffer%`. The constructor is an
ordinary constructible function the global object binds as a writable,
non-enumerable, configurable property, so calling it without `new` throws a
`TypeError` and `new ArrayBuffer(length, options)` is ordinary construction.
The length runs through ToIndex, so a fractional, string, boolean, nullish,
or `valueOf`-bearing argument becomes its truncated integer and a negative,
infinite, or beyond-`2^53-1` request throws a `RangeError`. The options bag
is read only when it is an object, and only its `maxByteLength` property is
consulted, so a non-object and an absent or `undefined` maximum both produce
a fixed-length buffer. A present maximum runs through ToIndex as well, its
getter and its conversion propagate abruptly, and a length above it throws a
`RangeError` before the new target's `prototype` is read. An instance takes
its `[[Prototype]]` from that read, so a subclass instance inherits from the
subclass prototype and a non-object result falls back to
`%ArrayBuffer.prototype%`.

`[[ArrayBufferData]]` is one zero-initialized Data Block that exactly one
buffer owns. A resizable buffer reserves its whole maximum up front, as
AllocateArrayBuffer specifies, so `resize` moves `[[ArrayBufferByteLength]]`
inside a block that never moves and clears every byte outside the new length
in both directions; a later grow therefore exposes zeroes rather than what a
shrink discarded. `resize` requires the resizability brand before it converts
its argument and the attached state after it, so an argument whose conversion
detaches the buffer still observes the specified `TypeError`, and a length
above the maximum throws a `RangeError`. `transfer` and
`transferToFixedLength` allocate a second block, copy the overlapping bytes,
and only then detach the source, so no block is ever reachable from two
buffers and an allocation failure leaves the source intact. `transfer`
preserves resizability and its maximum while `transferToFixedLength` reports
the new length as the maximum; both leave the source detached with a zero
`byteLength` and a retained resizability brand. `byteLength` and
`maxByteLength` report `0` once detached, `resizable` keeps reporting the
brand, and `detached` reports the state itself. All four are getter-only
accessors that reject a receiver without the brand.

`slice` rejects a detached source, clamps both bounds through
ToIntegerOrInfinity, and allocates through SpeciesConstructor, so an absent
`constructor`, a nullish species, a non-object `constructor`, a
non-constructor species, a species that returns a value that is not an
ArrayBuffer, one that returns the source, one that returns a detached or
too-small buffer, and one that detaches the source while it runs each reach
their specified outcome. `ArrayBuffer.isView` is `false` for every value this
profile can produce, because no admitted value carries
`[[ViewedArrayBuffer]]` until a view kind lands. `%ArrayBuffer%` carries the
`Symbol.species` accessor that reports its receiver, and the prototype
carries `Symbol.toStringTag`, so `Object.prototype.toString` reports
`[object ArrayBuffer]`.

Fixed native and generated differential evidence at property seed
`0x60003a00` covers both specialization policies, collection forced at every
safepoint, false hints, deliberate shape-guard misses, generic fallback,
fixed and resizable allocation, every ToIndex conversion class, the option
bag's abrupt orders, brand rejection over five receiver kinds, resize in both
directions, both transfers over eight source and target shapes, fifteen slice
ranges, ten species outcomes, and a collection-pressure loop that discards
sixty-four buffers around a survivor and a transferred store. Both native
execution targets compile the runtime under the address and undefined-behavior
sanitizers, so the ownership rules above execute under them. Byte contents
stay unobservable from ECMAScript until a view kind lands, so the zeroing and
copying above rest on that structural and sanitizer evidence rather than on a
value a program can read.

All 192 paths under the node's inventory root are now reviewed: 128 pass and
64 record explicit prerequisites. Twenty-four reach an unadmitted standard
global at compile time, twelve need `Reflect.construct`, nine need
`SharedArrayBuffer`, ten need `DataView`, four need a TypedArray constructor,
four need `Object.isExtensible`, and one needs `Reflect` with a second realm.
The reviewed feature list gains `ArrayBuffer`,
`align-detached-buffer-semantics-with-web-reality`, `arraybuffer-transfer`,
and `resizable-arraybuffer`, and the reviewed dependency vocabulary gains
`array-buffer`. The reviewed harness gains `detachArrayBuffer.js`, which
performs the detach its `$262` hook would through the admitted
`transferToFixedLength`, and records `resizableArrayBufferUtils.js` as
unavailable because it builds every TypedArray constructor at load time; the
five reviewed cases that include it keep their existing
`unsupported-profile-feature` classification and record that harness reason
instead of the feature they now share with this node. The manifest reaches
7,613 cases: 5,038 passes, 1,355 expected negatives, and 1,220 unsupported
profile features with no semantic, harness, or infrastructure failures. The
suite revision, 41,091-path inventory, manifest schema and vocabulary, and
zero-override policy are otherwise unchanged. The new component and its heap
kind move the runtime ABI to `oseo-runtime-m5-55` without a public layout
change and without changing the graph's orchestration state.

M5b node `object-integrity-levels` gives every object an extensibility state
that the six admitted Object integrity statics expose. `preventExtensions`
clears that state, `seal` also makes each own property non-configurable, and
`freeze` also makes each own data property non-writable. `isExtensible`,
`isSealed`, and `isFrozen` inspect those states directly; primitives are
already sealed and frozen and are never extensible. All three transitions
return their input, including primitives, without boxing it.

SetIntegrityLevel applies stored changes through the shared descriptor
component, so mapped arguments aliases, String wrappers, and module namespace
restrictions retain their existing generic behavior. Array `length` and
function `prototype` participate through their specialized storage. A sealed
mapped arguments object retains its live parameter alias because its data
properties remain writable, while freezing it severs that alias when the
descriptor becomes non-writable. Prototype mutation and new own-property
definition fail once extensibility has been cleared.

Fixed native and generated differential evidence at property seed
`0x60003c00` covers both specialization policies, collection forced at every
safepoint, false hints, deliberate shape-guard hits and misses, generic
fallback, all three transitions and queries, data and accessor descriptors,
ordinary objects, arrays, functions, arguments aliases, String wrappers,
primitive inputs, and collection pressure. All 317 paths under the node's six
inventory roots were reviewed. Of those paths, 314 enter the manifest: 206
pass and 108 retain explicit prerequisites for unadmitted standard globals,
`Proxy`, `Reflect`, TypedArrays, SharedArrayBuffer, DataView, host objects,
private fields, and dynamic source. The remaining three seal function kinds
by constructing new source through the `Function` constructor and stay
outside the reviewed subset under ADR 0016. Nineteen previously reviewed
cross-family cases also become passes because the admitted extensibility state
satisfies their prerequisite. The manifest reaches 7,927 cases: 5,263 passes,
1,355 expected negatives, and 1,309 unsupported profile features with no
semantic, harness, or infrastructure failures. The suite revision,
41,091-path inventory, manifest schema and vocabulary, and zero-override
policy are unchanged. The runtime ABI moves to `oseo-runtime-m5-56` without
changing the graph's orchestration state.

### Standard global value properties and declarations

M5b node `global-object-record` installs the standard `Infinity`, `NaN`, and
`undefined` value properties with non-writable, non-enumerable, and
non-configurable descriptors and every constructor global the profile admits.
Script GlobalDeclarationInstantiation checks all top-level lexical names for
restricted properties and validates every function and `var` name against the
existing descriptor and global object extensibility before any mutation. A
new property stores its binding cell. A declaration over an existing
configurable property retains that property as Object Environment Record
storage, so deletion, accessor replacement, and later descriptor changes stay
visible through identifier operations. That property-owned path includes every
admitted configurable constructor global, so a bare identifier observes an
object-property write and deletion changes its later read and `typeof`
behavior. HasBinding includes inherited properties, and identifier deletion
and `typeof` keep the same fallback through an active `with` environment. A
`var` redeclaration therefore preserves the standard value and exact
descriptor, while a restricted function or lexical declaration and a missing
declaration on a non-extensible global fail before the body runs. Those
failures use the exact declaration range retained through HIR and MIR. Module
and function-local declarations remain declarative bindings. A failed
standard-global installation does not publish its partial object, so a later
attempt can complete the realm global.

Fixed native and generated differential evidence at property seed
`0x60003d00` covers all three values, descriptor identity, admitted intrinsic
collisions, strict and non-strict writes, deletion, accessor replacement,
inherited binding lookup, `with` fallback, failed installation retry,
restricted lexical and function declarations, non-extensible creation, both
specialization policies, forced collection at every safepoint, deliberate
shape-guard hits and misses, and generic fallback.
The inventory contains 62 paths under the three value-property roots and
*test/language/global-code/*. Fifty-nine are reviewed: 25 pass, 9 are expected
negatives, and 25 retain explicit prerequisite boundaries. One of those paths
was already reviewed, so this node adds 58 manifest entries. The remaining
three depend on the separately owned `Array` global or Module import and export
parsing. Dynamic-source cases retain their explicit boundary, and `globalThis`
remains parked for the architecture decision that reconciles a mutable global
object with closed-world name resolution. The manifest reaches 7,985 cases:
5,288 passes, 1,364 expected negatives, and 1,333 unsupported profile features
with no semantic, harness, or infrastructure failures. The follow-up runtime
ABI moves to `oseo-runtime-m5-59` without exposing the global object or
changing the graph's orchestration state. Compatibility classifications and
counts do not move.

### Object.defineProperties descriptor collection

M5b node `object-define-properties` admits `Object.defineProperties` over
the property-key, descriptor, and own-key components the descriptor
checkpoint already landed. The target check precedes every read of the
properties argument, so a primitive target throws before a poisoned
properties getter can run. ToObject then precedes the own-key walk, so a
nullish properties argument throws and a primitive is read through the
wrapper it converts to, including a String wrapper's index properties. The
walk keeps the own enumerable keys in ordinary own-key order: integer
indices lead in ascending numeric order, string keys follow in creation
order, and symbol keys trail. Each kept key's descriptor is read with Get,
so an accessor on the properties object runs and a deleted or
no-longer-enumerable key is skipped, and each read descriptor converts
through the one ToPropertyDescriptor body `Object.defineProperty` shares,
observing `enumerable`, `configurable`, `value`, `writable`, `get`, and
`set` in that order with the specified callable and exclusivity checks.

The whole collection pass completes before the first definition mutates the
target. An abrupt completion while collecting, including a non-object
descriptor value, an abrupt field read, an accessor field that is neither
undefined nor callable, and a descriptor mixing accessor and data fields,
therefore leaves the target untouched. The collected descriptors then apply
in own-key order through the shared DefinePropertyOrThrow body, so an
incompatible redefinition throws a `TypeError` that keeps every earlier
definition and stops every later one. Ordinary objects, arrays and their
`length`, functions and their `prototype`, mapped arguments aliases, String
wrappers, symbol keys, and module namespace compatibility all behave as the
descriptor component already specifies, and a module namespace works as the
properties argument with its exports read through their binding cells.

Fixed native and generated differential evidence at property seed
`0x60003e00` covers both specialization policies, collection forced at every
safepoint, false hints, deliberate shape-guard misses, generic fallback,
one to three colliding integer and string keys in every literal order,
every independently optional descriptor field, abrupt getters, mixed and
non-object descriptors at each collection position, namespace sources and
targets, and a collection-pressure loop over twenty-four definitions. All
632 paths under the node's inventory root are reviewed: 540 pass and 92
retain explicit prerequisite boundaries for the unadmitted `Array`,
`Boolean`, `Date`, `JSON`, `Math`, `RegExp`, and `String` globals, `Proxy`,
and the `Reflect.construct` the constructor-check harness needs. The
manifest reaches 8,617 cases: 5,828 passes, 1,364 expected negatives, and
1,425 unsupported profile features with no semantic, harness, or
infrastructure failures. The suite revision, 41,091-path inventory,
manifest schema and vocabulary, and zero-override policy are unchanged. The
completed collection checkpoint moves the runtime ABI to `oseo-runtime-m5-60`
without changing the graph's orchestration state.

M5b node `array-constructor` makes `Array` a replaceable intrinsic value and
completes its realm cluster with length-argument construction,
`Symbol.species`, `from`, `of`, and `isArray`. Fixed native and generated
differential evidence at seed `0x60003f00` covers generic constructor
receivers, iterator closing, descriptors, both specialization policies,
forced collection, false hints, and a deliberate shape-guard miss. Of the 176
paths in the node inventory, 174 are reviewed: 145 pass and 29 retain explicit
prerequisite boundaries. The two omitted paths require later `map` and
`splice` semantics; the fixed and generated `Array.from` suites replace their
construction and mutation observations. One hundred forty existing dependency
cases also move from unsupported to pass. The manifest reaches 8,791 cases:
6,113 passes, 1,364 expected negatives, and 1,314 unsupported profile features
with
no semantic, harness, or infrastructure failures. The suite revision,
41,091-path inventory, manifest schema and vocabulary, and zero-override policy
are unchanged. The public intrinsic table moves the runtime ABI to
`oseo-runtime-m5-61` without changing the graph's orchestration state.

M5b node `string-intrinsic` makes `String` a materialized realm value. The
constructor is an ordinary constructible function bound as the standard
writable, non-enumerable, configurable property of the global object, so
`new String` is ordinary construction and every static is an ordinary method
call. Calling `String` converts through the shared `ToString`, except that a
Symbol argument renders SymbolDescriptiveString instead of throwing;
constructing it brands the receiver the new target produced with
`[[StringData]]`, so a subclass keeps its own prototype. A String exotic
object carries one non-writable, non-configurable, enumerable own property
per UTF-16 code unit and a non-writable, non-enumerable, non-configurable
`length`, and %String.prototype% is itself such an object over the empty
String, so `Object.prototype.toString` reports `[object String]` for either.
Sixteen selected ES5-era methods are materialized as ordinary boundary
functions with their specified descriptors. Calling one still reports the
owned unadmitted-method boundary until its String prototype node lands.
`String.fromCharCode` truncates each converted argument with `ToUint16` in
argument order; `String.fromCodePoint` rejects a non-integral, negative, or
above-`0x10FFFF` code point with a `RangeError` at the argument that produced
it and encodes an astral code point as a surrogate pair, while a lone
surrogate stays exactly the code unit it names; and `String.raw` follows the
specified order of `ToObject`, the `raw` read, LengthOfArrayLike, and the
alternating literal and substitution conversions. Fixed native
and generated differential evidence at seed `0x60004000` covers both
specialization policies, collection forced at every safepoint, false hints,
deliberate shape-guard misses, generic fallback, lone surrogates, astral code
points, coercion order, and global `String` replacement and deletion. The
reviewed subset admits the `String.fromCodePoint` feature tag so that static
executes its upstream cases instead of reporting an unadmitted feature. Of
the 150 paths under the node's four inventory roots, 145 are reviewed: 114
pass and 31 retain explicit prerequisite boundaries. The remaining five call
the materialized `String.prototype.charCodeAt` boundary, whose behavior no
admitted prototype-method node implements yet.
Ninety-four previously reviewed cases also move from unsupported to pass
because a real `String` value and the descriptor-complete boundary for those
methods satisfy their prerequisites. The manifest reaches 8,936 cases: 6,321
passes, 1,364 expected negatives, and 1,251 unsupported profile features with
no semantic, harness, or infrastructure failures. The suite revision,
41,091-path inventory, manifest schema and vocabulary, and zero-override policy
are unchanged. The materialized constructor adds no generated-code entry point
and moves the runtime ABI to `oseo-runtime-m5-62` without changing the graph's
orchestration state.

M5b node `string-prototype-access` implements the materialized prototype's
`at`, `charAt`, `charCodeAt`, `codePointAt`, `toString`, and `valueOf`
functions while preserving its existing `constructor` link. The four access
methods first reject a nullish receiver, convert every other receiver with
the shared `ToString`, and then apply `ToIntegerOrInfinity` to the position.
`at` permits a negative position relative to the UTF-16 code-unit length;
`charAt` and `charCodeAt` return the specified empty String and `NaN`
out-of-range results; and `codePointAt` combines only a leading and trailing
surrogate at the selected position. `toString` and `valueOf` accept only a
String primitive or an object carrying `[[StringData]]`, including
`%String.prototype%` itself, and reject every other receiver with a
`TypeError`. The other fourteen materialized String prototype methods retain
their source-located M5b boundary.

Fixed native and generated differential evidence at seed `0x60004100` covers
primitive and generic receivers, branded wrappers, UTF-16 edge cases,
conversion order, abrupt conversions, both specialization policies, forced
collection at every safepoint, false hints, deliberate shape-guard misses,
and generic fallback. All 105 paths under the node's inventory roots are
reviewed: 89 pass and 16 retain explicit prerequisite boundaries for dynamic
source, realms, unadmitted built-in constructors, constructor detection, or
later String methods. Thirty-two previously reviewed dependency cases also
move from unsupported to pass. The manifest reaches 9,041 cases: 6,442 passes,
1,364 expected negatives, and 1,235 unsupported profile features with no
semantic, harness, or infrastructure failures. The suite revision,
41,091-path inventory, manifest schema and vocabulary, and zero-override
policy are unchanged. The admitted runtime checkpoint moves the runtime ABI
to `oseo-runtime-m5-63` without adding a generated-code entry point or changing
the graph's orchestration state.

M5b node `array-prototype-iterative` implements ordinary `every`, `forEach`,
and `some` functions on the realm-owned `%Array.prototype%`. Each method first
converts its receiver and snapshots LengthOfArrayLike, then validates the
callback before visiting the initial index range. A visit performs HasProperty
and Get at that moment, so holes are skipped, inherited and newly created
properties are observed, deleted properties are omitted, and appended indices
outside the snapshot remain unvisited. The callback receives the value, index,
and converted receiver with the supplied `thisArg`. `every` and `some` stop at
the first decisive callback result; `forEach` ignores that result and returns
`undefined`.

Fixed native and generated differential evidence at seed `0x60004200` covers
sparse arrays, inherited entries, ordinary array-like and primitive receivers,
callback order, early and abrupt completion, mutation during iteration, both
specialization policies, forced collection at every safepoint, false hints,
deliberate shape-guard misses, and generic fallback. Of the 627 paths under the
node's inventory roots, 615 are reviewed: 541 pass and 74 retain explicit
prerequisite boundaries. Twelve resizable-buffer cases remain outside the
subset for unreviewed TypedArray or harness support. Static array elements now
use CreateDataProperty, so an own element overrides an inherited accessor
before an iterative method retrieves it. The manifest reaches 9,656 cases:
6,983 passes, 1,364 expected negatives, and 1,309 unsupported profile features
with no semantic, harness, or infrastructure failures. The suite revision,
41,091-path inventory, manifest schema and vocabulary, and zero-override policy
are unchanged. The admitted runtime checkpoint moves the runtime ABI to
`oseo-runtime-m5-64` without adding a generated-code entry point or changing
the graph's orchestration state.

M5b node `string-prototype-search-and-slice` implements the materialized
prototype's `concat`, `indexOf`, `lastIndexOf`, `includes`, `startsWith`,
`endsWith`, `slice`, and `substring` functions. All eight first reject a
nullish receiver and then convert every other receiver through the shared
`ToString`. `concat` converts each argument in order. The search methods
convert the search value before the position, while `includes`, `startsWith`,
and `endsWith` first apply `IsRegExp` and reject a true `@@match` result.
Matching uses UTF-16 code units. `indexOf`, `includes`, and `startsWith`
default their position to zero; `lastIndexOf` treats an omitted or `NaN`
position as positive infinity; and `endsWith` defaults its end position to
the subject length. Each position is converted and clamped before matching.
`slice` applies relative negative indices and an empty result for reversed
bounds, while `substring` clamps negative bounds to zero and swaps reversed
endpoints. The other ten materialized String prototype methods retain their
source-located M5b boundary.

Fixed native and generated differential evidence at seed `0x60004300` covers
primitive and generic receivers, `@@match`, conversion order, abrupt
conversions, empty searches, UTF-16 edge cases, both specialization policies,
forced collection at every safepoint, false hints, deliberate shape-guard
misses, and generic fallback. All 253 paths under the node's inventory roots
are reviewed: 217 pass and 36 retain explicit prerequisite boundaries for
dynamic source, realms, unadmitted built-in constructors, constructor
detection, or RegExp objects. Six previously reviewed dependency cases also
move from unsupported to pass. The manifest reaches 9,909 cases: 7,206 passes,
1,364 expected negatives, and 1,339 unsupported profile features with no
semantic, harness, or infrastructure failures. The suite revision,
41,091-path inventory, manifest schema and vocabulary, and zero-override
policy are unchanged. The admitted runtime checkpoint moves the runtime ABI
to `oseo-runtime-m5-65` without adding a generated-code entry point or changing
the graph's orchestration state.

M5b node `array-prototype-species-mapping` implements ordinary `map` and
`filter` functions on the realm-owned `%Array.prototype%`. Each method first
converts its receiver, snapshots LengthOfArrayLike, and validates the callback
before calling ArraySpeciesCreate. For an Array receiver, that operation reads
`constructor` and, when the result is an object, reads `Symbol.species`.
Missing, `undefined`, and `null` species use the realm Array; a custom
constructor receives the requested result length; and a non-constructor or
abrupt read throws. A non-Array receiver uses the realm Array without either
observable read. Both methods retain the shared HasProperty and Get visit
semantics. `map` creates at the snapshot length and preserves holes, while
`filter` creates at length zero and compacts accepted values in visit order.

Fixed native and generated differential evidence at seed `0x60004400` covers
sparse and generic receivers, default and custom species, observable and
abrupt reads, mutation during iteration, both specialization policies, forced
collection at every safepoint, false hints, deliberate shape-guard misses, and
generic fallback. All 458 paths under the node's inventory roots are reviewed:
390 pass and 68 retain explicit prerequisite boundaries. The manifest reaches
10,367 cases: 7,596 passes, 1,364 expected negatives, and 1,407 unsupported
profile features with no semantic, harness, or infrastructure failures. The
suite revision, 41,091-path inventory, manifest schema and vocabulary, and
zero-override policy are unchanged. The admitted runtime checkpoint moves the
runtime ABI to `oseo-runtime-m5-66` without adding a generated-code entry point
or changing the graph's orchestration state.

M5b node `promise-all-and-race` completes both combinators over the
materialized constructor. Each static builds NewPromiseCapability from its
receiver, reads that constructor's `resolve` once before acquiring the
iterator, and calls the captured method with the constructor as receiver for
every iterated value. `Promise.all` gives every index one guarded fulfillment
closure, shares the capability rejection function, and resolves its result in
input order. `Promise.race` shares both capability settlement functions and
leaves an empty input pending. Its outer abrupt paths use the same
first-settlement guard, so a thenable assimilation job queued by the first
resolution wins over a later `then` getter or iterator-step throw. An abrupt
resolve call, `then` getter, or `then` call closes an unfinished iterator before
rejection and preserves the original throw over an abrupt `return`; an abrupt
iterator step or value read marks the iterator done and does not close it.
`Promise.all` creates own result data properties without invoking inherited
indexed setters. A subclass owns the aggregate promise independently of the
species constructor that a later `then` selects.

Fixed native and generated differential evidence at seeds `0x60004500` and
`0x60004501` covers
empty, sparse, array, and custom iterable inputs, bounded thenable schedules,
both specialization policies, collection forced at every safepoint, false
hints, deliberate guard misses, generic fallback, and observable constructor,
resolve, iterator, and species operations, including first settlement before
later abrupt completion and inherited indexed setters. The reviewed
*promiseHelper.js*
harness executes all 16 scheduling cases that use it. Of the 192 paths under
the node's two inventory roots, 190 are reviewed: 173 pass and 17 retain
explicit prerequisite boundaries for the unhandled-rejection host policy,
`eval`, other profile syntax, `Object.getOwnPropertyNames`, or
`Reflect.construct`. The two remaining paths require string iteration and stay
with the separate `string-iterator` node; fixed and generated evidence covers
the combinators' empty-input contracts. The manifest reaches 10,548 cases:
7,760 passes, 1,364 expected negatives, and 1,424 unsupported profile features
with no semantic, harness, or infrastructure failures. The suite revision,
41,091-path inventory, manifest schema and vocabulary, and zero-override policy
are unchanged. The admitted runtime checkpoint moves the runtime ABI to
`oseo-runtime-m5-67` without adding a generated-code entry point or changing
the graph's orchestration state.

M5b node `string-prototype-match-and-split` implements the materialized
prototype's `match`, `matchAll`, `search`, and `split` functions. An object
operand first receives the applicable `Symbol.match`, `Symbol.matchAll`,
`Symbol.search`, or `Symbol.split` lookup. A callable method receives the
original receiver and, for `split`, the original limit. A nullish method,
primitive operand, or missing operand takes the fallback. `matchAll` first
applies `IsRegExp` through `@@match`, requires a global `flags` value for a
true result, and returns an iterator over nonoverlapping admitted matches.
`match` and `search` report the first admitted match, including match index,
input, and groups metadata. `split` preserves receiver, limit, and separator
conversion order, `ToUint32` limits, empty separators, empty subjects, and
the specified zero-limit behavior.

The RegExp fallback admits fixed-width literal, dot, escaped syntax, control,
hexadecimal, Unicode, digit, word, and whitespace atoms. Quantifiers,
alternatives, assertions, character classes, captures, and backreferences
remain behind a source-located `OSEO2001` boundary owned by the RegExp pattern
and matcher nodes, so no accepted pattern receives literal approximation.
Hexadecimal and Unicode escapes without the required digits reach the same
boundary. A trailing backslash throws `SyntaxError` as an invalid pattern.
`matchAll` uses a collector-traced RegExp String iterator with its own shared
prototype, inherited iterator identity, lazy `next`, and UTF-16 code-unit
empty-match advancement. Mutating the Array iterator prototype cannot change
its steps.

Fixed native and generated differential evidence at seeds `0x60004600` and
`0x60004601` covers
primitive, wrapper, and generic receivers, all four symbol dispatches, null
protocol methods, match metadata and iteration, empty matches and separators,
both specialization policies, forced collection at every safepoint, false
hints, deliberate shape-guard misses, and generic fallback. All 239 paths under
the node's inventory roots are reviewed: 130 pass and 109 retain
explicit prerequisite boundaries for RegExp syntax and objects, dynamic
source, realms, or unadmitted built-ins. The two null-method cases that
dynamically produce the RegExp pattern `\d` were outside the subset in the
previous checkpoint. Both now pass with fixed and generated replacement
evidence. The combined manifest reaches 10,787 cases: 7,890 passes, 1,364
expected negatives, and 1,533 unsupported profile features with no semantic,
harness, or infrastructure failures. The suite
revision, 41,091-path inventory, manifest schema and vocabulary, and
zero-override policy are unchanged. The admitted runtime checkpoint moves the
runtime ABI to `oseo-runtime-m5-68` without adding a generated-code entry
point or changing the graph's orchestration state.

M5b node `array-prototype-copying` implements ordinary `concat`, `flat`,
`flatMap`, `join`, `slice`, `toLocaleString`, and `toString` functions on the
realm-owned `%Array.prototype%`. Each method converts its receiver before its
later method-specific work, and each copying or stringification loop obtains
LengthOfArrayLike at its specified point. Sparse copying uses HasProperty
before Get, while `join` and `toLocaleString` retrieve every index and render
nullish values as empty fields for admitted lengths. Matching Node.js and Deno,
these methods and ordinary string conversion that reaches intrinsic Array
`toString` reject a length above `2**32 - 1` with a catchable `TypeError`, and
every runtime string producer rejects a result above 536,870,888 UTF-16 code
units with a catchable `RangeError`. `concat` reads
`Symbol.isConcatSpreadable` before its Array fallback. `concat`, `flat`,
`flatMap`, and `slice` create Array results through ArraySpeciesCreate,
preserving observable constructor and `Symbol.species` reads, custom result
constructors, and generic-receiver realm allocation.

FlattenIntoArray skips holes, calls a `flatMap` mapper before deciding whether
the mapped value is an Array, and recursively flattens only Array values. Zero
and finite depth retain their ordinary results. Cyclic or positive-infinity
paths that exceed the admitted nesting limit reach the runtime's deterministic
depth boundary without native stack overflow. `join` converts its separator
after reading length and uses recursion-safe nested Array stringification.
`toLocaleString` invokes each non-nullish element's method with the same
receiver and exactly the outer locales and options, forwarding two `undefined`
values when they were omitted, and converts its result. A recursive locale
conversion of the same receiver renders an empty element. During element
conversion, re-entry through `join`, `toString`, or `toLocaleString` on the
same active receiver likewise renders an empty string instead of exceeding the
call-depth boundary. `toString` calls a callable `join` property and otherwise
delegates to `Object.prototype.toString`.

Fixed native and generated differential evidence at seed `0x60004700` covers
sparse Arrays, ordinary and primitive generic receivers, observable property
order, `Symbol.isConcatSpreadable`, every ArraySpeciesCreate default and guard
fallback, custom species, recursive and cyclic input, locale result coercion,
locale argument forwarding, locale cycles, oversized-length rejection,
large-length index access ordering, callback behavior, and abrupt completion.
Both specialization policies, forced collection at every safepoint, false
hints, deliberate guard hits and misses, and generic fallback are exercised. Of
the 229 paths under the node's seven inventory roots, 228 are reviewed: 181
pass and 47 retain explicit prerequisite boundaries. The pinned
*invoke-element-tolocalestring.js* case asserts the non-ECMA-402 fallback's
zero-argument call and is omitted because this method follows the ECMA-402
superseding call contract; the fixed differential fixture replaces its
element-call evidence. No new path outside those roots is added. Two
already-reviewed cases outside the roots move from unsupported to pass because
they exercise the newly admitted `toString` and generic `slice` behavior. The
manifest reaches 11,015 cases: 8,073 passes, 1,364 expected negatives, and
1,578 unsupported profile features with no semantic, harness, or infrastructure
failures. The suite revision, 41,091-path inventory, manifest schema and
vocabulary, and zero-override policy are unchanged. The admitted runtime
checkpoint moves the runtime ABI to `oseo-runtime-m5-69` without adding a
generated-code entry point or changing the graph's orchestration state.

M5b node `map-intrinsic` completes the realm-owned `%Map%` constructor
together with SameValueZero-keyed `[[MapData]]` storage, insertion order,
and `%MapIteratorPrototype%`. The constructor reads the target's `set`
method once through AddEntriesFromIterable and calls it for every iterated
two-element entry, closing an unfinished iterable on a non-object entry, an
abrupt element read, or an abrupt `set` call while preserving the original
throw completion. `set` normalizes a `-0` key to `+0`; `delete` and `clear`
mark a record dead in place instead of removing it, so a live
`%MapIteratorPrototype%.next` walking the same array by index never skips
or misaligns past a concurrent mutation, and a key deleted and re-added
reappears at the end of insertion order. `forEach` re-reads the entry array
on every step, so a `set` call from inside the callback that grows the
backing storage is still observed, and it always returns `undefined`
regardless of the callback's return value. `Map.groupBy` builds its result
directly into a fresh map's records instead of through an observable `set`
lookup, and the `Symbol.species` accessor returns its receiver unchanged.

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
reaches 11,196 cases: 8,221 passes, 1,364 expected negatives, and 1,611
unsupported profile features with no semantic, harness, or infrastructure
failures. The
suite revision, 41,091-path inventory, manifest schema and vocabulary, and
zero-override policy are unchanged. The admitted runtime checkpoint moves
the runtime ABI to `oseo-runtime-m5-70` without adding a generated-code
entry point or changing the graph's orchestration state.

Implemented M5b node `number-prototype` gives the materialized
`%Number.prototype%` real `toString` and `valueOf` bodies in place of the
placeholder that named this node, and adds `toFixed`, `toExponential`,
`toPrecision`, and `toLocaleString`. `toString` accepts an optional radix:
radix 10 reuses the existing shortest round-trip decimal algorithm, and
radix 2 through 36 convert the receiver's exact mantissa and binary exponent
through a bignum built for this node, rendering the integer part exactly and
advancing the remaining fraction against the distance to the rounding
boundary, stopping once the tail no longer exceeds it and raising the final
digit when ordinary rounding selects it and the raised value still names the
same double. This keeps a non-terminating radix from emitting digits the
receiver's precision does not carry. It is the round-trip stopping rule
rather than a shortest-string search, and its tie test inspects the final
digit rather than the whole coefficient; ECMA-262 leaves both to the
implementation for a non-decimal radix.

The budget is two-sided. A power of two lies twice as far from its upper
neighbor as from its lower one, so truncating spends the distance to the
lower rounding boundary and rounding up spends the distance to the upper
one. One shared budget would let a truncated expansion of a value such as
`0.5` in radix 5 cross the lower boundary and name a different double.

Because ECMA-262 leaves a non-decimal radix implementation-approximated,
that exactness is a recorded divergence rather than a match. V8 advances its
remaining fraction in floating point, so for a fraction whose expansion does
not terminate its last digits can differ from the exact result. Over a
767-case sweep of values and radices, including binade boundaries, the
smallest denormal, and randomly drawn bit patterns, 280 outputs differed.
Every Oseo result read back as the original double; 229 of V8's did not, and
no case had the reverse relationship. Oseo keeps the exact result, so an
admitted program can differ from V8 in the trailing digits of a
non-terminating fractional expansion, always in the direction of
round-tripping. Terminating radices, which include every power of two, agree
exactly and are pinned digit for digit.
Differential evidence for the non-terminating cases asserts the reparsed
magnitude on all three engines instead of the spelling, because the
reference engines do not agree with each other's exact digits either.

`toFixed`, `toExponential`,
and `toPrecision` round through the same bignum numerator-over-denominator
representation rather than repeated floating-point arithmetic, so every
fraction-digit and significant-digit count rounds to the nearest value with
ties away from zero, exactly as ECMA-262 specifies. The decimal exponent a
significant-digit request needs is found by exact bignum comparison against
powers of ten instead of a `log10` estimate, because a value adjacent to a
power-of-ten boundary can round to a self-consistent but wrong digit count
on either side of that boundary if the exponent is only a floating-point
guess. `toLocaleString` returns the base specification's own fallback,
`thisNumberValue` followed by `ToString`, since no ECMA-402
Internationalization API is admitted. Every method shares one
`thisNumberValue` brand check, admitting a Number primitive or a Number
wrapper object and rejecting every other receiver, including a generic
object with a `valueOf` method: unlike String.prototype's coercing
receiver, Number.prototype's brand check has no looser fallback. The generic
`ToPrimitive` conversion path's narrow placeholder for the deferred
`Number.prototype.toString`, which read the receiver's `[[NumberData]]`
directly by prototype-chain position, is removed; the generic property
lookup and call it already used for every other constructor now reaches
this node's real methods instead. Fixed native and generated differential
evidence at seed `0x60004900` covers both specialization policies, forced
collection at every safepoint, a false hint, and a deliberate shape-guard
miss. Of the 168 paths under the node's inventory root, 155 pass and 13
retain explicit prerequisite boundaries for `Reflect.construct`, `Date`,
`Boolean`, and the mutable global object implicit-assignment binding this
checkpoint does not admit. Completing `valueOf` and `toString` also lets 21
already-reviewed paths outside this node's own root, in `Number`, `Object`,
`Array`, `Array.prototype.join`, `Function.prototype.bind`, and
`String.fromCharCode`/`split`, pass where they previously retained an
unsupported-profile-feature boundary citing the same placeholder; their
entries move with this change since the manifest requires every reviewed
path's classification to match observed evidence. Two of the twenty-one are
the `Array.prototype.join` cases that take a Number wrapper as `length`,
which the separately landed array-prototype-copying node reviewed while
that placeholder still stood. The combined manifest reaches 11,364 cases:
8,397 passes, 1,364
expected negatives, and 1,603 unsupported profile features with no semantic,
harness, or infrastructure failures. The suite revision, 41,091-path
inventory, manifest schema and vocabulary, and zero-override policy are
unchanged. The admitted runtime checkpoint moves the runtime ABI to
`oseo-runtime-m5-71` without adding a generated-code entry point or changing
the graph's orchestration state.

M5b node `bigint-intrinsic` materializes the callable `BigInt` intrinsic,
`%BigInt.prototype%`, branded wrapper objects, `asIntN`, `asUintN`, `toString`,
`toLocaleString`, and `valueOf` over M5a's exact primitive. Calling `BigInt`
applies `ToPrimitive` with the number hint once. An integral Number takes an
exact `NumberToBigInt` branch; every other primitive takes the shared
`ToBigInt` conversion, with the specified `TypeError`, `RangeError`, and
`SyntaxError` order. The fixed-width statics convert their width through
`ToIndex` before the operand and truncate through a width-bounded two's
complement. An identity result never materializes `2**bits`.

`BigInt` has a `[[Construct]]` slot, so class heritage and generic constructor
selection observe `IsConstructor(BigInt)` as true. Every direct or derived
construction throws `TypeError` before argument conversion, and generic
`Array.from` and `Array.of` construction reaches that same rejection.

`%BigInt.prototype%` is an ordinary object with no `[[BigIntData]]` slot. Its
methods share one brand check that admits a BigInt primitive or branded wrapper
and rejects the prototype itself and every other receiver. Radix conversion is
exact from 2 through 36, and `toLocaleString` uses the base specification's
fallback because ECMA-402 remains outside the profile. `Object.prototype`
string tagging obtains `"BigInt"` through `Symbol.toStringTag`; overriding that
property with a non-string correctly falls back to `"Object"`.

The object model lives in *runtime\_bigint\_object.c* and reads no limb. The
private *runtime\_bigint.c* operations retain exact integral-Number conversion,
radix text, and fixed-width truncation behind `OseoValue`. Fixed and generated
differential evidence covers both reference hosts, both specialization
policies, forced collection, false hints, guard misses, mutable global binding
behavior, the reviewed 65,536-bit resource ceiling, and deterministic
allocation-attempt sweeps over result publication, Number conversion, radix
staging buffers, wrappers, and partial intrinsic initialization. Each failed
attempt is collected and retried to prove cleanup, stable identity, roots, and
complete publication. The generated family uses seed `0x60004b00` in the
reserved block through `0x60004bff` with an independent base-2^15 Number model.
The runtime ABI moves to `oseo-runtime-m5-72`, and built-in code range index 14
is
allocated without a gap. No compiler IR or generated-code entry point changes.

All 77 paths under *test/built-ins/BigInt/* are reviewed: 61 pass and 16 retain
explicit boundaries. Eight need deferred non-BigInt primitive-wrapper methods,
six need `Reflect.construct`, one needs realm creation, and one also reaches the
unadmitted `Date` intrinsic. Four already-reviewed Object paths and six String
paths outside that root also move from unsupported to pass. The complete
manifest moves from 11,364 to 11,441 cases, from 8,397 to 8,468 passes, keeps
1,364 expected negatives, and moves from 1,603 to 1,609 unsupported profile
features, with no semantic, harness, or infrastructure failures. The suite
revision, 41,091-path inventory, manifest schema and vocabulary, and
zero-override policy are unchanged.

M5b node `data-view` materializes `%DataView%` and `%DataView.prototype%` over
the Data Block the `array-buffer` node already owns, so a program can read and
write those bytes for the first time. The constructor requires `new`, requires
an `ArrayBuffer`, runs `ToIndex` over `byteOffset` and then over `byteLength`,
and validates the detached state and both bounds once before and once after
`OrdinaryCreateFromConstructor` reads the new target's `prototype`. No
admitted source construct reaches that read with an accessor, so the second
validation is observed natively rather than from a reviewed program. An absent
`byteLength` fixes the view's length over a fixed-length buffer and makes it
length-tracking over a resizable one, which is the candidate edition's `auto`.

A view owns no Data Block. It holds only its buffer's value, so the collector
keeps the block alive by tracing the buffer, and nothing in the component
allocates, resizes, or releases a block. Every accessor and every element
access recomputes the buffer's detached state and byte length, so a detached or
shrunk buffer produces the specified `TypeError` from `byteLength`,
`byteOffset`, and every `get` and `set`, while `buffer` still reports the
detached buffer. A zero-length view exactly at the end of its buffer stays in
bounds.

The eleven `get` and eleven `set` accessors cover `Int8`, `Uint8`, `Int16`,
`Uint16`, `Int32`, `Uint32`, `Float16`, `Float32`, `Float64`, `BigInt64`, and
`BigUint64`. Each `get` accessor runs `ToIndex` over the byte offset, then
`ToBoolean` over the byte-order flag; each `set` accessor runs `ToIndex`, then
`ToNumber` or `ToBigInt` over the stored value, then `ToBoolean`. Both then run
the out-of-bounds `TypeError` and the range `RangeError`, so a conversion that
detaches or shrinks the buffer still reaches the specified rejection. A
one-byte accessor takes no byte-order parameter: it passes little-endian
directly and runs no `ToBoolean`. The integer element types truncate and wrap
modulo the element width in two's complement. The float element types round to
nearest with ties to even in exact integer arithmetic over the operand's own
binary64 encoding, so no narrowing floating conversion happens and no operand
can reach an out-of-range one; `Float64` is bit-preserving, a signed zero keeps
its sign, and a NaN keeps its class. Each element moves through a local byte
buffer rather than a cast, so an unaligned access is ordinary, and every index
and size comparison is written so that no host addition can wrap.
`ArrayBuffer.isView` now reports the one admitted view kind.

The object model lives in *runtime\_data\_view.c* and reads no BigInt limb: the
two 64-bit element types reach the representation only through the raw-integer
operations *runtime\_bigint.c* exports. `ToIndex` becomes one shared conversion
in *runtime\_primitive.c* that both this node and `ArrayBuffer` call with their
own diagnostics. Fixed and generated differential evidence covers both
reference hosts, both specialization policies, forced collection at every
safepoint, false hints, guard misses, mutable global binding behavior, every
conversion and failure order, subclass construction, unaligned access at every
offset of an eight-byte element, length-tracking and fixed-length views across
grow and shrink, and a deterministic allocation-attempt sweep over the view
record, the intrinsic cluster, and the BigInt a 64-bit load produces. Each
failed attempt is collected and retried to prove cleanup, roots, stable
identity, and complete publication. The generated family uses seed `0x60004c00`
in the reserved block through `0x60004cff` with an independent byte-level model
that reads no host `DataView` and no host BigInt. The runtime ABI moves to
`oseo-runtime-m5-73`, and built-in code range index 15 is allocated without a
gap. No compiler IR or generated-code entry point changes.

All 550 paths under *test/built-ins/DataView/* are reviewed: 443 pass and 107
retain explicit boundaries. Thirty-nine need `SharedArrayBuffer`, thirty-two
need `Reflect.construct` or the `Reflect` namespace, thirty need a TypedArray
constructor, four need the deferred non-BigInt primitive-wrapper prototype
methods, one reaches an unresolvable identifier this profile rejects at compile
time, and two of those also need a second realm. Five already-reviewed
`ArrayBuffer` paths, one `Array.prototype` path, and one `Object.seal` path
outside that root move from unsupported to pass. The reviewed feature list
gains `DataView`, `Float16Array`, and the eight `DataView.prototype.*` accessor
features this node implements; the reviewed dependency vocabulary gains
`data-view`; and the reviewed harness gains upstream's
`byteConversionValues.js` data table and a `verifyPrimordialProperty` alias
whose reviewed `verifyProperty` already restores what it probes. The complete
manifest moves from 11,441 to 11,991 cases, from 8,468 to 8,918 passes, keeps
1,364 expected negatives, and moves from 1,609 to 1,709 unsupported profile
features, with no semantic, harness, or infrastructure failures. The suite
revision, 41,091-path inventory, manifest schema, and zero-override policy are
unchanged.

M5b node `regexp-unicode-property-escapes` admits the six regular expression
character class escapes and exact Unicode property escapes over the Unicode
17.0.0 tables pinned by `@oseo/unicode`. The resolver admits canonical binary
property names, lone General\_Category values, and General\_Category, Script, or
Script\_Extensions name-value pairs. Loose matching and a lone Script value are
early errors. The frontend supplies this resolver at the owned parser boundary,
while the compiler core remains independent of the tables. The generic matcher
continues to own complement, Unicode traversal, and ignore-case closure.

The checkpoint adds no specialized matcher, runtime allocation, generated-code
entry point, or built-in code range. Existing fixed native String fallback
evidence covers all six class escapes under both specialization policies,
deliberate guard misses, and forced collection. Generated differential evidence
at seeds `0x60004e00`, `0x60004e01`, and `0x60004e02` compares the generic
matcher with the host engine for class escapes and every canonical property
family. The retained empty `Hrkt` Script value uses its absence from the pinned
Script and Script\_Extensions assignments because the host rejects that alias.
The diagnostic domain asserts the exact kind, section, message, and source
span for invalid forms. The property ratchet moves from 94 domains, 94 seeds,
and 4,594 ordinary cases to 97 domains, 97 seeds, and 5,074 cases. The runtime
ABI moves to `oseo-runtime-m5-74` without changing a C layout or runtime
component.

All 625 paths under *test/built-ins/RegExp/CharacterClassEscapes/* and
*test/built-ins/RegExp/property-escapes/* are reviewed. The 142 parse-negative
paths are expected negatives, and 483 retain explicit later-node boundaries.
The complete manifest reaches 12,616 cases: 8,918 passes, 1,506 expected
negatives, and 2,192 unsupported profile features, with no semantic, harness,
or infrastructure failures. The suite revision, inventory policy, ADR 0013
vocabulary, and zero-override policy do not change.

M5b node `regexp-intrinsic` materializes `%RegExp%` and
`%RegExp.prototype%`, defines the constructor link and `Symbol.species`
accessor, and installs the writable global binding. Calling `RegExp` uses the
intrinsic as `newTarget` and preserves the specified same-constructor identity
case. Construction keeps the actual `newTarget`, reads its `prototype` before
operand conversion, and therefore gives a derived constructor's instances the
derived prototype.

`IsRegExp` reads `Symbol.match` before falling back to the runtime brand. A
branded RegExp copies its internal source and, when flags are absent, its
internal flags. Another regexp-like object supplies those values through
ordered `source` and `flags` property reads. Allocation precedes pattern and
flags string conversion. Every instance owns an ordinary `lastIndex` data
property initialized to zero, writable, non-enumerable, and non-configurable,
and points to a separately allocated immutable matcher artifact. The collector
traces the instance, artifact, source, and flags as one ownership chain.

Dynamic initialization validates the admitted generic-matcher grammar.
Invalid patterns and flags throw a catchable `SyntaxError`; Unicode property
escapes, Unicode set and string syntax, modifier groups, and reviewed resource
limits retain source-located `OSEO2001` boundaries. Pattern execution, result
construction, prototype accessors, symbol methods, String replacement,
literal lowering, and those pattern extensions remain outside this node. The
`exec`, `test`, and `toString` properties exist with their built-in metadata
but report the explicit execution boundary when called.

Fixed and generated differential evidence covers both reference hosts, both
specialization policies, forced collection at every safepoint, call and
construction behavior, regexp-like conversion order, false hints, guard hits
and misses, subclass allocation, catchable dynamic errors, and mutable
`lastIndex` state. A deterministic allocation-attempt sweep covers complete
cluster construction, successful wrapper and artifact initialization, and the
catchable-SyntaxError path. Each failed attempt is collected and retried to
prove cleanup, roots, stable intrinsic identity, and complete publication. The
generated family uses seeds `0x60004f00` and `0x60004f01` in the reserved block
through `0x60004fff`, with an independent constructor-state and error oracle.
The runtime ABI moves to `oseo-runtime-m5-75`, and built-in code range index 16
is allocated without a gap. No generated-code entry point changes.

All 492 paths in the node's reviewed RegExp roots are included: 111 pass and
381 retain explicit downstream boundaries. Sixty-nine already-reviewed Array,
Object, and Symbol paths outside those roots also move from unsupported to
pass because they observe the real RegExp object. The combined manifest moves
from 12,616 to 13,108 paths, keeps 9,098 passes and 1,506 expected negatives,
and moves from 2,192 to 2,504 unsupported profile features, with no semantic,
harness, or infrastructure failures. The suite revision,
41,091-path inventory, manifest schema, and zero-override policy are unchanged.

M5b node `array-prototype-sort` implements ordinary `sort` and `toSorted`
functions on the realm-owned `%Array.prototype%` and removes `sort` from the
unadmitted boundary table. Both reject a non-callable comparator before
converting the receiver, so an invalid comparator throws before any `length`
read is observable. `toSorted` reads LengthOfArrayLike and allocates its plain
Array before reading any element, and a length above `2**32 - 1` throws a
catchable `RangeError` there.

SortIndexedProperties reads every index into one collected list before the
first comparison. `sort` uses HasProperty before Get, so holes are skipped and
collapse behind the sorted elements, while `toSorted` reads through holes, so
a hole becomes an undefined element of the copy. CompareArrayElements orders
an undefined element after every defined one without calling the comparator,
converts a supplied comparator's result with `ToNumber` and reads `NaN` as
`+0`, and otherwise compares the `ToString` results in code-unit order. The
sort is stable, and the first abrupt comparison stops it before any further
one. `sort` then writes the sorted elements back with Set and deletes the
trailing indices with DeletePropertyOrThrow, leaving `length` unchanged, while
`toSorted` fills the Array it already allocated. Neither method reads
`constructor` or `Symbol.species`, so a species-bearing receiver still yields
an ordinary Array. Every element read, comparison, write-back, and deletion
observes the receiver at its specified step, so an accessor that appends,
truncates, deletes, or assigns during the sort produces the specified result.

Fixed native and generated differential evidence at seed `0x60005100` covers
sparse, generic, inherited, primitive, and frozen receivers, undefined and
hole ordering, comparator validation and coercion, abrupt completion at each
observable step, stability across both merge shapes, accessor-driven mutation,
copy isolation, and length coercion and limits. Both specialization policies,
forced collection at every safepoint, false hints, deliberate guard hits and
misses, and generic fallback are exercised. Of the 75 paths in the node's two
inventory roots, 74 are reviewed: 55 pass and 19 retain explicit prerequisite
boundaries for the unadmitted `Boolean` and `isNaN` globals, regular
expression evaluation, `Reflect.construct`, resizable-buffer TypedArray views,
and the `Array.prototype` `pop` and `reduce` methods later nodes own. The one
omitted path builds a 2,048-element array literal, which exceeds the
documented 32,768 root-slot native frame budget before any sorting runs; the
fixed suite replaces its stability observation with an eleven-element ordering
over duplicated keys. No path outside the roots changes classification.
`stable-array-sort` and `change-array-by-copy` join the reviewed
supported-feature list because this node admits both, and no already-reviewed
path carries either flag. The manifest reaches 13,182 cases: 9,153 passes,
1,506 expected negatives, and 2,523 unsupported profile features with no
semantic, harness, or infrastructure failures. The suite revision,
41,091-path inventory, manifest schema and vocabulary, and zero-override
policy are unchanged. The admitted runtime checkpoint moves the runtime ABI to
`oseo-runtime-m5-76` and allocates two code IDs inside the existing Array
range without adding a generated-code entry point or changing the graph's
orchestration state.

M5b node `regexp-prototype-and-exec` admits built-in regular expression
execution and the prototype surface that reads it. `RegExp.prototype.exec`
reads `lastIndex` through ordinary property semantics, converts it with
`ToLength`, ignores it unless the pattern is global or sticky, and writes the
end of the match, or zero on failure, back through an ordinary `Set` that a
read-only slot rejects. A sticky pattern attempts one position; every other
pattern advances one character at a time, which is one code point under `u`
or `v`.

A successful execution returns an ordinary Array holding the matched
substring, each capture or `undefined`, `index`, `input`, a null-prototype
`groups` object when the pattern declares a group name, and, under `d`, the
`MakeMatchIndicesIndexPairArray` result with its own `groups` object.
`test` dispatches through `RegExpExec`, so an overridden `exec` is called and
a non-object, non-null result is a `TypeError`. `toString` reads `source` and
`flags` generically. The `source` accessor returns `EscapeRegExpPattern`, so
an empty pattern is `(?:)`, an unescaped solidus outside a class is escaped,
and a line terminator becomes its escape sequence, reusing a backslash that
already precedes it. The `flags` accessor
composes the eight individual accessors through ordinary property lookup in
the order `d`, `g`, `i`, `m`, `s`, `u`, `v`, `y`, and each individual accessor
answers from the artifact, returns `undefined` for `%RegExp.prototype%`
itself, and is a `TypeError` for any other receiver without the slot.

The new *runtime\_regexp\_matcher.c* component compiles one validated
pattern into an owned instruction program over a register file and executes
it with an explicit backtrack stack and undo trail, so backtracking depth is
data rather than native recursion. It reproduces the choice order, capture
visibility, assertion and lookaround behavior, backreference resolution,
quantifier priority, empty-progress failure, UTF-16 and code-point traversal,
and canonicalization the `@oseo/compiler` matcher already owns, which is what
makes the generic artifact one semantic authority across both. Execution
allocates no managed memory, calls no user code, and reaches no safepoint,
and the collector releases the program with the artifact that owns it.

Ignore-case closure folds every equivalence decision into a set while the
program is built. Simple case folding and the code-unit uppercase rule map
nothing outside ASCII into ASCII except U+017F and U+212A, so every remaining
class lies entirely inside or entirely outside ASCII; the runtime therefore
resolves an ASCII closure exactly and keeps a source-located `OSEO2001`
boundary for a set that meets a non-ASCII class it has no folding data for,
and for a backreference under `i` in a pattern whose sets can match such a
code point. Reaching a reviewed instruction, register, step, backtrack-entry,
or trail-entry limit keeps the same boundary. Regular expression literals,
well-known symbol methods, `String.prototype` dispatch, `RegExp.escape`, and
the regular expression string iterator remain outside this node.

Fixed and generated differential evidence covers both reference hosts, both
specialization policies, forced collection at every safepoint, deliberate
guard misses, and false hints. The generated family uses seeds `0x60005000`
through `0x60005002` in the reserved block through `0x600050ff`; its
execution domain keeps a structured pattern model until it prints source and
takes its expected observation from the compiler-side matcher rather than
from the hosts, so a disagreement is visible from three sides at once. The
allocation-attempt sweep gains the program-construction,
successful-execution, match-indices, and stringification paths. The matcher
program and the executor work area are unmanaged memory, so the runtime gains
one work-area allocator that shares the managed allocator's deterministic
attempt counter without collecting, which is what lets the sweep fail every
allocation those paths take. The runtime ABI moves to
`oseo-runtime-m5-77`. The RegExp built-in code range replaces its one shared
deferred-method ID with thirteen dedicated IDs, so the range holds nineteen
of its two hundred fifty-six, and no generated-code entry point changes.

The one deliberate divergence from both reference hosts is how a failed
attempt advances under `u`. The edition advances by one code point, so an
attempt that fails at a surrogate pair resumes after it, while V8 resumes
between the pair's two code units: `/\B/u` on `"A\u{10428}"` is index 3 for
the edition and 2 for V8, and `/(?!^)/u` on `"\u{10428}"` is 2 and 1. The
compiler-side matcher and this runtime both produce the edition's answer, and
*test/built-ins/RegExp/prototype/exec/u-lastindex-adv.js* backs that reading.
Only a zero-width term can succeed at the resumed position, because V8 still
reads a whole code point when it consumes there, so the generated execution
domain emits no assertion or lookaround term under `u` and keeps the complete
assertion and lookaround vocabulary everywhere else.

All 271 paths in the node's reviewed RegExp prototype roots are included:
116 pass and 155 retain explicit downstream boundaries, most of them regular
expression literals a later node owns. The reviewed feature list gains
`regexp-dotall` and `regexp-match-indices`, the two features this node
implements. Forty-two already-reviewed paths outside those roots also move
from unsupported to pass: thirty-six `RegExp` construction cases and five
`String.prototype.match` cases that observe a pattern executing, and one
`typeof` case that reads an `exec` result. The complete manifest moves from
13,182 to 13,453 paths, from 9,153 to 9,311 passes, keeps 1,506 expected
negatives, and moves from 2,523 to 2,636 unsupported profile features, with
no semantic, harness, or infrastructure failures. The suite revision,
41,091-path inventory, manifest schema, and zero-override policy are
unchanged.

M5b node `string-prototype-replace` implements the materialized prototype's
`replace` and `replaceAll` functions. `replace` leaves the
unadmitted-method placeholder list, and `replaceAll` becomes an own property
of `%String.prototype%` for the first time. Both observe their search
operand only when it is an Object, which then receives a `Symbol.replace`
lookup; a callable method is called on the operand with the original
receiver and the original replacer as exactly two arguments. `replaceAll`
first applies `IsRegExp` to an Object operand and, for a true `@@match`
result, requires an object-coercible `flags` value containing `g` before the
lookup. A primitive operand, a missing operand, and a nullish method take
the String fallback. `%RegExp.prototype%` gains the deferred
`Symbol.replace` placeholder that already stood for the four other String
protocol symbols, so a RegExp operand reaches the owned
`regexp-symbol-methods` boundary through GetMethod rather than the
code-unit search this node admits.

The fallback converts the receiver, then the search value, then a
non-callable replacer, and matches UTF-16 code units. `replace` substitutes
the first occurrence. `replaceAll` substitutes every nonoverlapping
occurrence, advancing by one code unit for an empty search string, so an
empty search inserts the replacement before every code unit and once after
the last. A callable replacer is never converted, receives the matched text,
its position, and the whole subject, and has its result converted through
`ToString`. A String replacer runs through GetSubstitution, where `$$`,
`` $` ``, `$&`, and `$'` substitute and substituted text is not rescanned.
Both callers supply an empty capture list and an undefined named-capture
object, so `$1` through `$99` and `$<name>` have no referent and copy their
reference text unchanged; the RegExp nodes that introduce captures extend
that operation.

Observing the operand only when it is an Object is the current
specification and the behavior the pinned suite revision asserts. The
pinned Node.js reference host still performs the older unconditional
lookup while the pinned Deno host does not, so that observation is carried
by the reviewed test262 cases rather than by a fixed differential fixture,
which requires both reference hosts to agree.

Fixed native and generated differential evidence at seeds `0x60005200` and
`0x60005201` covers primitive, wrapper, and generic receivers, both symbol
dispatches, null, non-callable, and abruptly read methods, every
GetSubstitution reference form against subjects that contain `$`,
functional replacers with their arguments and abrupt results, empty
searches and subjects, overlapping candidates, lone surrogates,
`replaceAll`'s `IsRegExp` and `flags` observations with their abrupt forms,
`replace`'s absence of those observations, nullish and Symbol receivers,
both specialization policies, forced collection at every safepoint, false
hints, deliberate shape-guard misses, and generic fallback.

All 100 paths under the node's two inventory roots are reviewed: 54 pass and
46 retain explicit prerequisite boundaries. Thirty-eight build a regular
expression, four need the unadmitted `Boolean` wrapper receiver, two need
the `Function` constructor, and two need `Reflect.construct`. Those RegExp
rows keep the `functions` and `object-properties` tags they earn instead of
gaining `regular-expressions`, which stays with the deferred cross-family
retagging `regexp-symbol-methods` owns. No previously reviewed path changes
classification. The manifest moves from 13,453 to 13,553 cases and from
9,311 to 9,365 passes, keeps 1,506 expected negatives, and moves from 2,636
to 2,682 unsupported profile features, with no semantic, harness, or
infrastructure failures. The suite revision, 41,091-path inventory, manifest
schema and vocabulary, and zero-override policy are unchanged. The admitted
runtime checkpoint moves the runtime ABI to `oseo-runtime-m5-78` without
adding a generated-code entry point or changing the graph's orchestration
state. The String built-in code range gains two IDs for the two methods, and
the RegExp range gains a twentieth for the deferred `[Symbol.replace]`
placeholder.

M5b node `generic-string-coercion` routes `ToString` for an arbitrary object
through the materialized `%Object.prototype.toString%`, `@@toPrimitive`, and
`@@toStringTag`. OrdinaryToPrimitive reads `valueOf` and `toString` with the
ordinary property lookup and calls whichever function it finds, so the
conversion no longer selects a private text substitute by intrinsic
prototype identity. The two retired substitutes were a virtual
receiver-sensitive tag text and a function-and-promise unsupported
diagnostic with a purely numeric shortcut to `NaN`.

A promise therefore renders as `[object Promise]` through its prototype's
`@@toStringTag`, and its numeric conversion materializes that text before
`ToNumber`, so a `@@toStringTag` getter is observed. An object inheriting
`%Function.prototype.toString%` without being callable reaches that method's
own `TypeError`. A replaced `%Object.prototype.toString%` was already called
through the ordinary lookup; deleting it is newly observable, because an
object left with neither convertible method throws the specified catchable
`TypeError`.

Array text keeps the deferred conversion selected by intrinsic identity,
which the Array prototype nodes own; measuring it against the reference
hosts while retiring the substitutes above found one unchanged divergence
they still own, a cyclic array-like whose `length` accessor is observed once
rather than twice because the deferred path detects the cycle before reading
it. Two receivers still report an owned prerequisite boundary from inside
`%Object.prototype.toString%` rather than from the conversion: generator
functions and generator objects, whose intrinsic reflection
`function-intrinsic-chains` owns, and `Boolean` and `Symbol` wrappers, whose
prototype methods `boolean-intrinsic` and `symbol-intrinsic` own.

Fixed native and generated differential evidence at seed `0x60005300` covers
`@@toPrimitive` dispatch with each hint string and its non-callable,
object-result, and abrupt rejections, an explicit null method, hint order
and fallthrough, an object with neither convertible method, a null-prototype
receiver, `@@toStringTag` in own, inherited, non-string, getter, abrupt, and
builtin-shadowing forms, every admitted builtinTag receiver, deleted and
replaced default methods, `Object.prototype.toLocaleString` over the same
receivers, both specialization policies, false hints, deliberate shape-guard
misses, generic fallback, and collection forced at every safepoint.

The node declares no test262 inventory root, because every applicable
upstream path its behavior reaches is already reviewed: the 41 paths under
*test/built-ins/Object/prototype/toString/* and the two each under
*test/built-ins/Symbol/toPrimitive/* and
*test/built-ins/Symbol/toStringTag/*. No previously reviewed path changes
classification, and the manifest keeps 13,553 cases with 9,365 passes, 1,506
expected negatives, and 2,682 unsupported profile features, with no
semantic, harness, or infrastructure failures. The suite revision,
41,091-path inventory, manifest schema and vocabulary, and zero-override
policy are unchanged. The admitted runtime checkpoint moves the runtime ABI
to `oseo-runtime-m5-79` without adding a generated-code entry point, a
built-in code ID, or a translation unit, and without changing the graph's
orchestration state.

M5b node `object-create` completes `Object.create` over the
ObjectDefineProperties body the collection checkpoint already landed. The
prototype check precedes every read of the properties argument, so a
prototype that is neither an object nor null throws a `TypeError` before a
poisoned properties getter can run, and the fresh object is created with
exactly the requested null or object prototype, including array, function,
and module namespace prototypes. An undefined or absent properties
argument returns the fresh object directly. Any other properties value
flows through the one ObjectDefineProperties body `Object.defineProperties`
owns: ToObject precedes the own enumerable key walk, so a nullish
properties argument throws and a primitive is read through the wrapper it
converts to, each kept descriptor is read with Get and converts through
the shared ToPropertyDescriptor body in ordinary own-key order, and the
whole collection pass completes before the first definition. Definitions
on the fresh extensible target cannot fail, so an abrupt collection is the
only abrupt completion, and it discards the created object with the thrown
error. Object, array, mapped arguments, and module namespace properties
arguments keep the compatibility rules the collection checkpoint recorded,
a namespace reading each descriptor through its binding cells. The M3
descriptor-map rejection and its `object-create-descriptor-map` dependency
observation retire, so call and constructor spread now reach the same
admitted contract with dynamic arity.

Fixed native and generated differential evidence at property seed
`0x60005400` covers null, object, and invalid prototypes ahead of entries,
undefined, and null properties arguments, every independently optional
descriptor field, seven admitted value families, abrupt getters, mixed and
non-object descriptors at each collection position, module namespace
properties and prototype arguments, both specialization policies, false
hints, deliberate shape-guard misses, generic fallback, forced collection
at every safepoint, and a collection-pressure loop over twenty-four
chained creations. All 320 paths under the node's inventory root are
reviewed: 267 pass and 53 retain explicit prerequisite boundaries.
Forty-eight need the unadmitted `Boolean`, `Date`, `JSON`, and `Math`
globals, four need the deferred `Object.getOwnPropertyNames` static, and
one needs `Reflect.construct`. The previously reviewed
`test/language/statements/for-in/order-enumerable-shadowed.js` moves from
unsupported to pass because its only blocker was the retired
descriptor-map rejection. The manifest moves from 13,553 to 13,872 cases
and from 9,365 to 9,632 passes, keeps 1,506 expected negatives, and moves
from 2,682 to 2,734 unsupported profile features, with no semantic,
harness, or infrastructure failures. The suite revision, 41,091-path
inventory, manifest schema and vocabulary, and zero-override policy are
unchanged. The admitted runtime checkpoint moves the runtime ABI to
`oseo-runtime-m5-80` without adding a generated-code entry point or
changing the graph's orchestration state.

M5b node `regexp-literal-aot` admits regular expression literals. A literal
is an expression wherever the grammar admits one, and its pattern is parsed
and compiled during the build to the immutable `@oseo/compiler` matcher
artifact that `regexp-generic-matcher` already established as the family's
semantic authority. Nothing about the pattern is read at run time: no
pattern tree, bootstrap-parser node, or pattern text survives as something
to be parsed. An invalid pattern or flag set stays an ECMA-262 early error
at the offending text, and a pattern whose artifact the build cannot
produce, because it reaches an owned instruction or register limit or needs
a Unicode fact the composition root did not supply, reports the profile
boundary at the same text.

Evaluating a literal allocates a fresh RegExp object whose prototype is
`%RegExp.prototype%`, which is what GetPrototypeFromConstructor reaches for
`%RegExp%` because its `prototype` property is neither writable nor
configurable, and whose own `lastIndex` is a writable, non-enumerable,
non-configurable data property starting at zero. Repeated evaluation of one
occurrence and evaluation of two equal occurrences never share object
identity or mutable state. The realm keeps one immutable matcher artifact
per descriptor, so equal evaluations share compiled instructions, sets,
repetition records, group names, and pattern text without sharing anything
observable. Two source occurrences of one pattern still emit two
descriptors: object allocation and identity are never deduplicated.

The C backend writes the compiled artifact as generated data, and its
layout is generated-code ABI declared in *oseo\_runtime.h*: the instruction
array, the concatenated inversion lists and their offsets, the repetition
table, the capture and group-name tables, the written pattern and flag
text, and the normalized flag mask. One entry point, `oseo_regexp_literal`,
takes that descriptor and returns the fresh object, and the runtime's
matcher executes the descriptor with the same executor a dynamic pattern
reaches. Both compilation paths therefore run one choice order, capture
visibility, assertion and lookaround behavior, backreference resolution,
quantifier priority, empty-progress failure, and UTF-16 and code-point
traversal. A backreference to a duplicated group name expands to one
instruction per candidate capture, which is the shape the runtime's own
pattern compiler emits.

A descriptor may carry the complete `Canonicalize` table its build computed
from the pinned Unicode tables, and does so exactly when the pattern
compares two input characters under `i`, which is only a backreference;
every other ignore-case decision is folded into a set while the artifact is
built. A literal therefore admits an ignore-case pattern whose closure
reaches a non-ASCII equivalence class, and it resolves Unicode property
escapes, both of which the runtime's own pattern compiler still refuses
with the documented `OSEO2001` boundary because it links no folding or
property data. Those are differences in profile reach, not in matching:
where both paths admit a pattern they produce the same match state, and the
generated evidence compares them case by case.

`@oseo/compiler` still links no Unicode data. The command line is the
composition root that supplies the two `Canonicalize` rules, the
`Space_Separator` set, and the property-escape lookup to the frontend, so a
literal compiled by a build and one compiled by a test describe the same
pinned release. A composition that supplies none cannot compile an
ignore-case pattern, a `\s` escape, or a property escape, and reports the
profile boundary rather than matching against a guess.

Fixed native and generated differential evidence at seeds `0x60005500`
through `0x60005502` covers literal and constructor compilation of one
generated pattern side by side, repeated evaluation with per-object
`lastIndex`, the written text the `source`, `flags`, and `toString`
behavior reports, match indices, global and sticky iteration, controlled
early errors, both specialization policies, forced collection at every
safepoint, false hints, deliberate shape-guard misses, and generic
fallback. The allocation-attempt sweep gains the literal path, so every
allocation it takes, including the realm cache's own table, fails once,
collects, and retries in the same context without publishing a partial
artifact or object. The cache reserves its slot before the artifact
exists, and it is addressed by descriptor rather than scanned, so one
evaluation's lookup does not grow with the number of literal sites. Structural
evidence in *tests/regexp-literal-aot.test.ts* proves that the artifact reaches
MIR, that the descriptor and its arrays are generated data, that no run-time
pattern construction is emitted, and that the canonicalization table appears
exactly where a comparison needs it.

The node declares no inventory root, so it promotes reviewed paths rather
than adding any. Three hundred eighty-one already-reviewed paths move from
unsupported to pass because a literal was the only thing they were waiting
for: 346 under *test/built-ins/RegExp/*, 27 String cases spread over
`endsWith`, `includes`, `match`, `matchAll`, `replace`, `replaceAll`,
`search`, `split`, and `startsWith`, which reach the owned boundary,
observe `IsRegExp`, or merely evaluate a literal argument before a
receiver error, three `Function.prototype` and three `Array.prototype`
cases that pass a regular expression as a non-callable argument, one
`Object.prototype.toString` case, and one module case that writes a
literal in a `for await` head.

Admitting literals also settled which diagnostic an Annex B rejection
reports, because a rejected literal is now the difference between a
program that builds and one that does not.
[ADR 0013](./adr/0013-m5-edition-and-manifest.md) places Annex B outside
the claim and requires a case inside the boundary that depends on it to be
reported as unsupported with the section named, never as a failure and
never dropped. The owned pattern parser now reports a construct only Annex
B admits as the profile boundary rather than as invalid text, and only
without `u` or `v`, because those flag sets never admitted the construct
and their rejection is the early error the edition itself requires. The
rule covers an identity escape over an `ID_Continue` character, a legacy
octal escape, a control escape without an ASCII letter, an incomplete
hexadecimal or Unicode escape, a quantified lookahead, an unescaped `]`,
`}`, or `{`, a class-escape bound class range, a backreference that names
no group, and a named backreference in a pattern that declares no group
name. A rejection Annex B shares, such as a quantified lookbehind, an
out-of-order class range, a named backreference in a pattern that does
declare a group name, or `\k` inside a class when that pattern declares a
group name, stays an early error in both modes.

That split makes the reported kind the record of whether a host engine
agrees, so the generated invalid pattern domain now uses it to decide when
the reference hosts are a sound oracle instead of asking whether a
unicode-mode flag is set. It also keeps
*test/built-ins/String/prototype/split/separator-regexp.js* classified as
unsupported: four of its thirty-seven literals, `/\XA0/`, `/\X/`,
`/\x/`, and `/\k<x>/`, parse only under Annex B, and the case now
reports that boundary instead of turning into a parse rejection.

The manifest keeps 13,872 paths, moves from 9,632 to 10,013 passes, keeps
1,506 expected negatives, and moves from 2,734 to 2,353 unsupported
profile features, with no semantic, harness, or infrastructure failures.
The runtime ABI moves to `oseo-runtime-m5-81`. The node adds one
generated-code ABI entry point, `oseo_regexp_literal`, and no built-in code
ID. The suite revision, 41,091-path inventory, manifest schema and
vocabulary, and the manifest's zero-override policy are unchanged.

M5b node `math-namespace` materializes the `Math` namespace object. It is an
ordinary object whose `[[Prototype]]` is the realm's `%Object.prototype%`,
and the global object binds it as a writable, non-enumerable, configurable
property, so a program may replace or delete `Math` exactly as it may
replace `Number` or `String`. It is not a function: it has neither
`[[Call]]` nor `[[Construct]]`, calling it throws a `TypeError`, and its
`Symbol.toStringTag` is the non-writable, non-enumerable, configurable
string `"Math"`, so `Object.prototype.toString` reports `[object Math]`.
None of its function properties is a constructor either, so `new Math.abs(1)`
throws a `TypeError` before any argument is converted.

The eight value properties `E`, `LN10`, `LN2`, `LOG10E`, `LOG2E`, `PI`,
`SQRT1_2`, and `SQRT2` are non-writable, non-enumerable, and
non-configurable, and each holds the Number value closest to the constant it
names. The thirty-six function properties of 21.3.2 are writable,
non-enumerable, and configurable ordinary built-in functions with their
specified names and lengths: `abs`, `acos`, `acosh`, `asin`, `asinh`,
`atan`, `atanh`, `atan2`, `cbrt`, `ceil`, `clz32`, `cos`, `cosh`, `exp`,
`expm1`, `f16round`, `floor`, `fround`, `hypot`, `imul`, `log`, `log1p`,
`log10`, `log2`, `max`, `min`, `pow`, `random`, `round`, `sign`, `sin`,
`sinh`, `sqrt`, `tan`, `tanh`, and `trunc`. `Math.sumPrecise` belongs to a
later edition than the one [ADR 0013](./adr/0013-m5-edition-and-manifest.md)
pins and is not added.

Every function converts its arguments with `ToNumber` in argument order and
propagates the first abrupt conversion without converting the arguments
after it, so a `Symbol` operand throws a `TypeError` and a throwing
`valueOf` is observed exactly once. A missing argument converts `undefined`,
which is `NaN` for the unary operations, and `Math.max`, `Math.min`, and
`Math.hypot` convert every argument they receive before comparing any of
them.

The exactly determined operations produce exactly the specified Number.
`Math.round` returns the closest integral Number and breaks a tie toward
positive infinity, so `Math.round(-2.5)` is `-2`, `Math.round(-0.2)` is
`-0`, and `Math.round(0.49999999999999994)` is `+0`. `Math.ceil`,
`Math.floor`, `Math.trunc`, `Math.abs`, `Math.sign`, `Math.sqrt`,
`Math.cbrt`, `Math.min`, `Math.max`, `Math.fround`, and `Math.f16round`
preserve the specified signed zero, and `Math.max` treats `+0` as larger
than `-0` while `Math.min` treats it as smaller. `Math.max` and `Math.min`
report `NaN` whenever any converted argument is `NaN`, while `Math.hypot`
reports `+∞` for an infinite argument even when another is `NaN`.
`Math.pow` follows Number::exponentiate rather than the host C library, so a
`NaN` exponent is `NaN` even for a base of one and a base of exactly one or
minus one with an infinite exponent is `NaN`. `Math.fround` and
`Math.f16round` round to binary32 and binary16 with ties to even over exact
binary64 scaling of the operand, so no narrowing floating conversion happens
and an operand that rounds past the format's largest finite value becomes an
infinity. `Math.clz32` and `Math.imul` read their
operands through `ToUint32` and report the exact counted and wrapped
results.

The remaining operations are the ones ECMA-262 marks
implementation-approximated, so this profile commits to their specified
special values, their argument conversion, and their sign behavior rather
than to a digit-exact result. On the supported native targets they are the
host C library's correspondingly named operations, which agree with the
reference hosts to within one unit in the last place; the differential
fixtures assert the specified exact cases directly and the approximated ones
through bounded identities so a permitted last-place difference is not
recorded as a semantic requirement.

`Math.random` returns a Number in `[0, 1)` drawn from a realm-owned
xorshift128+ generator whose two state words the realm mixes from its own
initialization ordinal, meaning the number of realms the process had
already initialized. ECMA-262 leaves the strategy to the implementation but
requires the `Math.random` of one realm to produce a sequence distinct from
every other realm's, and this runtime keeps every other observable schedule
reproducible, including its logical timer clock, so realm N of a run seeds
from ordinal N: a host that initializes its realms in one order draws the
same pairwise distinct sequences on every run and every supported target
rather than seeding from host entropy. The ordinal counter is atomic, so a
host that initialized two realms on separate threads would still give each
its own ordinal without a data race, but atomicity does not order the two,
so that host would keep distinctness and give up the fixed assignment of
ordinal to realm. No current host initializes realms concurrently. A later
host-capability decision owns introducing an entropy source; nothing in the
pinned suite observes the difference.

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
pairwise while every draw stays inside `[0, 1)`; the fixture prints those
draws and its driver runs the executable twice on the matching native
target to observe the two runs agreeing.

All 317 paths under the node's inventory root are accounted for and 316 are
reviewed: 280 pass and 36 retain the explicit `Reflect.construct`
prerequisite their *isConstructor.js* include needs.
*test/built-ins/Math/sqrt/results.js* stays outside the reviewed subset
because its thousand-entry nested array literal exceeds the runtime's
reviewed active frame-slot budget, an existing resource boundary this node
does not own. The reviewed *nans.js* harness include also becomes available,
because `Math.pow` was its only unadmitted dependency. One hundred and
five previously reviewed paths outside the root move from
`unsupported-profile-feature` to `pass`: one hundred and three read `Math`
while probing an unrelated contract, and two are the
_Object/internals/DefineOwnProperty/nan-equivalence-\*.js_ cases the new
include unblocks. Eleven of the hundred and three are the
_Object/create/15.2.3.5-4-\*.js_ cases that pass the `Math` object itself as
a `Properties` argument, which `object-create` reviewed as unsupported
while `Math` was absent, and five are _RegExp.prototype.exec_ and
_RegExp.prototype.test_ cases that read `Math` for a match subject or a
`lastIndex` value, which `regexp-literal-aot` reviewed as unsupported for
the same reason. No previously reviewed path loses a pass. The manifest
moves from 13,872 to 14,188 cases and from 10,013 to 10,398 passes, keeps
1,506 expected negatives, and moves from 2,353 to 2,284 unsupported
profile features, with no semantic, harness, or infrastructure failures. The
suite revision, 41,091-path inventory, manifest schema and vocabulary, and
zero-override policy are unchanged. The admitted runtime checkpoint moves
the runtime ABI to `oseo-runtime-m5-82` without adding a generated-code
entry point or changing the graph's orchestration state.


Known gaps inside the claim
---------------------------

Each gap names its owner. This list shrinks as M5 lands semantic units; it
must never shrink by reclassification alone.

M5a Unit 8.5n removed stale rejection claims for behavior the implementation
already admits and assigned every genuine remaining rejection an explicit
owner. Unit 8.5o closes the sole M5a evidence gap from that audit, so M5a is
complete. The remaining gaps retain their existing owners.

 -  The BigInt primitive, exact literals, `ToNumeric`, comparisons, operators,
    assignment, and update are admitted by M5a Unit 8.1a, and the callable
    `BigInt` intrinsic, `BigInt.prototype`, branded wrappers, `toString`,
    `toLocaleString`, `valueOf`, `asIntN`, and `asUintN` by the M5b
    `bigint-intrinsic` node, both as recorded above. `Object` supplies
    collector-traced BigInt wrappers whose ordinary `ToPrimitive` now reaches
    the real prototype methods. What remains is the dependent-family
    connection: the M5b `data-view` node now consumes `ToBigInt` for its two
    64-bit element types, while typed arrays, `Atomics`, and `JSON` keep their
    own object and concurrency prerequisites. `BigInt` now has the specified
    throwing `[[Construct]]`, but reviewed cases that require the separately
    unadmitted
    `Reflect.construct` namespace remain `unsupported-profile-feature` instead
    of borrowing a partial result. [*PLAN-BIGINT.md*](../PLAN-BIGINT.md) owns
    delivery items 8 through 10.
 -  Regular expression allocation, initialization, `lastIndex`, dynamic
    validation, and intrinsic identity are admitted by the M5b
    `regexp-intrinsic` node, and matching, result construction, `exec`,
    `test`, `toString`, and the ten prototype accessors by
    `regexp-prototype-and-exec`, and ahead-of-time literal compilation by
    `regexp-literal-aot`, all as recorded above. What remains
    outside the admitted profile is the pattern grammar this edition still
    defers, the real well-known symbol methods, `RegExp.escape`, and
    matcher backend selection, all owned by
    [*PLAN-REGEXP.md*](../PLAN-REGEXP.md). `%RegExp.prototype%` carries
    `@@match`, `@@matchAll`, `@@replace`, `@@search`, and `@@split` as
    deferred placeholders, so a String protocol method reaches one owned
    boundary through GetMethod rather than approximating a pattern; the
    `regexp-symbol-methods` node replaces them. Literal syntax is admitted:
    the frontend records a literal's pattern text, flag text, and range as
    an owned value, validates it with the owned pattern parser so an
    invalid pattern or flag set is an early error at the offending text,
    and compiles it to the immutable matcher artifact `@oseo/compiler`
    owns, which the C backend writes as generated data. Unicode property
    escapes resolve through the pinned tables, and a construct a later unit
    owns is refused where it appears.
    That artifact and its executor are the semantic authority both
    compilation paths reproduce. Dynamic construction reaches its
    admitted validation and artifact boundary, and `regexp-prototype-and-exec`
    connected that artifact to built-in execution and result construction.
    The runtime's own pattern compiler still refuses an ignore-case closure
    over a non-ASCII class and a Unicode property escape, so a dynamic
    pattern reaches those through the documented `OSEO2001` boundary while
    a literal compiles them; that is profile reach, not matching behavior.
    The reviewed property and character class escape roots contribute 142
    expected negatives and their remaining explicit later-node boundaries.
    [*regexp-inventory.md*](./regexp-inventory.md) records the clause,
    directory, flag, prototype, symbol, Unicode, and diagnostic inventory,
    including the Annex B constructs this grammar rejects in every mode.
 -  `import.meta`, `export var`, and namespace re-exports such as
    `export * as ns from "./module.js"` remain rejected with source-located
    diagnostics. Reviewed test262 cases carrying
    `export-star-as-namespace-from-module` classify
    `unsupported-profile-feature`. Owner: the modules and asynchronous
    execution stream.
 -  Array destructuring of a `for-in` key remains rejected. Every enumerated
    key is a string, and the realm does not yet expose the string iterator the
    array pattern must consume. Owner: the intrinsics and built-in objects
    stream.
 -  A `super` property reference in a class body without `extends` and in an
    object literal method stays rejected until the `super-without-extends`
    graph node lands. The object prototype root is now populated, but that
    does not admit the separate language surface. Owner: the intrinsics and
    built-in objects stream.
 -  The realm root now owns one collector-traced intrinsic graph, a callable
    and constructible `Object` value, primitive wrappers, and the
    `ArrayBuffer` constructor with its Data Block, and `DataView` over that
    block. The remaining standard
    constructors stay assigned to their dependency-ordered M5b nodes.
    `ArrayBuffer.isView` reports `true` for a `DataView` and `false` for
    every other value this profile can produce; the node that admits a
    TypedArray extends it with that kind's brand.
    No built-in dispatches through `Symbol.hasInstance` yet. test262 runtime
    negatives whose
    thrown value has no error identity, such as a thrown
    `Test262Error`, classify as unsupported with the
    `runtime-error-observation` capability named. Owner: the intrinsics
    and built-in objects stream.
 -  The `globalThis` binding does not exist. M5a Unit 8.1d gives Script
    top-level `this` and every non-strict nullish receiver one realm-wide
    global object. M5b `global-object-record` completes its static declaration
    model and installs `Infinity`, `NaN`, and `undefined` alongside the
    admitted `ArrayBuffer`, `BigInt`, `DataView`, `Map`, `Object`, `Number`,
    `Promise`, and `String` identities. Because this realm
    still binds none of the other unadmitted clause 19 standard globals, a
    Script
    top-level `var` declaration of such a name creates the fresh
    undefined-initialized property GlobalDeclarationInstantiation
    prescribes for an absent name, exactly as reviewed passes such as
    *for-of/dstr/obj-id-init-simple-no-strict.js* rely on; the window
    before its first assignment, where a conforming realm would still expose
    another standard intrinsic value, is part of this gap, and a case that
    observes it surfaces as a semantic failure at manifest review rather
    than entering silently. The remaining standard constructors still need to
    become real values. Dynamically created global bindings require the owned
    architecture decision on how a mutable global object meets closed-world
    name resolution. Two interactions sit outside this unit for different
    reasons. Annex B block-level function hoisting is
    outside the candidate claim under
    [ADR 0013](./adr/0013-m5-edition-and-manifest.md). Indirect `eval` var
    bindings stay inside that claim and outside this profile, because
    [ADR 0016](./adr/0016-dynamic-source-boundary.md) keeps the dynamic
    source family unsupported and
    [ADR 0019](./adr/0019-m5-claim-closure.md) authorizes that exclusion
    for M5 completion while leaving the conformance label to its own later
    gate. A case that depends on either classifies unsupported under the
    record that owns it instead of blocking this unit. The reviewed
    *test/language/global-code/* directory is now reviewed, with its
    dynamic-source and unresolved-name cases retaining those explicit
    boundaries. The reviewed
    *test/language/statements/with/12.10-2-4.js* and
    *test/language/statements/with/12.10-2-5.js* cases each contain a
    failure-only read of the unresolved global `x` outside the `with`
    environment. Their intended nullish `TypeError` path has fixed native
    evidence, but the complete upstream source remains
    `unsupported-profile-feature` until this global binding model lands. The
    reviewed *test/language/statements/try/optional-catch-binding-lexical.js*
    case stays `unsupported-profile-feature` for the same reason: its final
    assertion reads the unresolved global `y` through
    `assert.throws(ReferenceError, ...)`, while the optional catch clauses it
    contains are admitted by M5a Unit 8.5b. Strict writes to an unresolved name
    also stop at the source-located boundary recorded above instead of
    producing a runtime `ReferenceError`. The reviewed
    *function-code/block-decl-onlystrict.js* and
    *global-code/block-decl-strict.js* cases and four of the reviewed
    _statements/switch/scope-lex-\*.js_ cases expose the same boundary. Their
    block or switch binding is correctly absent outside its lexical scope, but
    the remaining read receives the compile-stage `Unknown binding` diagnostic
    instead of the runtime `ReferenceError` a dynamic global name-resolution
    path produces. Owner: `globalthis-binding` and the dynamic-source boundary;
    the
    surface audit in [*PLAN-M6.md*](../PLAN-M6.md) depends on this unit.
 -  Await inside a computed member of an assignment target, a computed binding
    property name, or an array or object binding default is admitted by M5a
    Unit 8.3 in ordinary asynchronous and asynchronous generator bodies, as
    recorded above. The same positions stay rejected with a source-located
    diagnostic at module top level. Its private traced frame can suspend an
    ordinary expression, but module construction still rejects a pattern that
    contains `await` before that frame is built. No reviewed test262 case
    exercises the module form on
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
    cases and *test/built-ins/Promise/resolve/arg-uniq-ctor.js*. `Promise`
    is now a materialized intrinsic value, so only the `constructor` read
    itself remains. Owner: the intrinsics and built-in objects stream.
 -  `%GeneratorFunction%` and `%GeneratorFunction.prototype%` are not
    materialized. `Object.getPrototypeOf` is admitted, but reflecting a
    generator function or generator object reports the explicit
    `generator-intrinsics` boundary until their graph nodes land. Creating a
    generator function dynamically also remains behind
    [ADR 0016](./adr/0016-dynamic-source-boundary.md), so the reviewed
    *test/built-ins/GeneratorFunction/* cases retain their owned unsupported
    classifications. There is no `GeneratorFunction` global binding in
    ECMAScript, so this profile does not add one. Owner: the intrinsics and
    built-in objects stream.
 -  `Object`, `Object.getPrototypeOf`, and `Promise` are admitted, but
    generator intrinsic reflection retains the explicit boundary above.
    Reviewed *test/built-ins/AsyncGeneratorPrototype/* and
    *test/built-ins/AsyncIteratorPrototype/* cases that require those routes
    remain `unsupported-profile-feature` under the matching
    `generator-intrinsics` or `dynamic-source` prerequisite. Owner:
    the intrinsics and built-in objects stream.
 -  `Promise.allSettled` and `Promise.any` are own properties of `%Promise%`
    with their specified names and lengths, but calling either reports the
    owned `promise-static-method` diagnostic instead of combining.
    The reviewed *Promise/allSettled/* and *Promise/any/* roots stay outside
    this node. Owner: the `promise-allsettled-and-any` graph node.
 -  A rejected promise that no reaction ever handles ends the program at the
    next rejection checkpoint. A case whose reason is not a typed error
    names the owned `unhandled-rejection-policy` boundary, but a case whose
    reason is an error instance is indistinguishable from an unhandled
    throw, so
    *Promise/prototype/then/rxn-handler-fulfilled-next-abrupt.js* and
    *Promise/prototype/then/rxn-handler-rejected-next-abrupt.js* stay
    outside the reviewed subset. Owner: the modules and asynchronous
    execution stream.
 -  The reviewed *promiseHelper.js* implements `checkSequence` for the
    `Promise.all` and `Promise.race` scheduling inventory. Its
    `checkSettledPromises` half stays deferred with the combinators that use
    it. Owner: the `promise-allsettled-and-any` graph node.
 -  `eval`, dynamic `Function` construction, and dynamic import stay
    explicitly
    unsupported under [ADR 0016](./adr/0016-dynamic-source-boundary.md).
    Reviewed cases that need them carry the `dynamic-source` dependency
    tag, and no release uses an unqualified conformance label while this
    boundary stands.
 -  Realm creation beyond the initial realm, agent clusters, and shared
    memory need runtime and harness capabilities that do not exist yet;
    affected tests name the missing `$262` capability.
 -  The reviewed harness implements *base.js*, *doneprintHandle.js*,
    *asyncHelpers.js*, *compareArray.js*, *nans.js*, *propertyHelper.js*,
    and the `checkSequence` portion of *promiseHelper.js*. *nans.js*
    joined that list with the `math-namespace` node, whose `Math.pow`
    intrinsic was its only unadmitted dependency. Cases in the reviewed
    function inventory that need *nativeFunctionMatcher.js* or
    *wellKnownIntrinsicObjects.js* classify as unsupported until those
    includes have reviewed implementations. The reviewed
    *asyncHelpers.js* probes `$DONE` with `typeof` rather than through
    `Object.prototype.hasOwnProperty.call(globalThis, "$DONE")`, because this
    profile does not admit `globalThis`. Its `assert.throwsAsync` reports a
    constructor mismatch without composing a message from the observed value,
    so a rejection whose `constructor` is missing or exotic cannot replace
    the mismatch report with a thrown conversion. Owner: the standards
    harness expansion in [*PLAN-M5.md*](../PLAN-M5.md).
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
from the expected classifications. `mise run test262:update` regenerates the
*results.yaml* index and its record partitions after a reviewed change.
Applicable Script cases execute in
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
*target-parity.yaml* pins the complete file-set digest and supported execution
targets. A host-specific run normalizes only the target spelling before
comparing the complete manifest, so any semantic, harness, infrastructure,
graph, scheduler, strictness, or specialization disagreement fails without
duplicating compatibility totals.

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
`$DONE` now composes the upstream failure detail, because generic string
coercion renders an ordinary object failure value; it guards that
composition and falls back to the bare marker for a Symbol and for any
object whose conversion completes abruptly, rather than replacing a case's
failure report with a thrown conversion.

A newly supported feature moves tests out of `unsupported-profile-feature`
only after every applicable variant executes. A changed upstream revision is
a reviewed manifest change, not an automatic percentage update.


Generated domains
-----------------

M5 measurement work reuses the M4 property infrastructure defined by
[*PLAN-PT.md*](../PLAN-PT.md). New semantic units added during M5 extend the
applicable valid and invalid generators in the same change that admits the
syntax, as required by [*CONTRIBUTING.md*](../CONTRIBUTING.md).
