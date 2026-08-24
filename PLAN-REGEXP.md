Regular expression plan
=======================

Status
------

Implementation status: delivery items 1 through 3, the Unicode property
escape checkpoint, the RegExp intrinsic checkpoint, and the prototype and
built-in execution checkpoint landed. Literal and probe work has not started.
This plan defines the M5 semantic and compilation boundary for ECMAScript
regular expressions. The active language profile admits the callable and
constructible `RegExp` intrinsic, initialization, `lastIndex` state,
built-in execution with its match result object, and the `exec`, `test`,
`toString`, `source`, `flags`, and individual flag members of
`RegExp.prototype`. It does not admit regular expression literals or the
well-known symbol and String dispatch surfaces owned by later delivery items.

The owned pattern AST, parser, validator, limits, extension points, and
structural dump live in `@oseo/compiler`, and the frontend validates a
literal's retained pattern and flag text there.
[*docs/regexp-inventory.md*](./docs/regexp-inventory.md) is the delivery
item 1 inventory. The generic matcher artifact and its executor live in the
same package and are the semantic authority for the admitted grammar.
The frontend resolves Unicode property escapes through the Unicode 17.0.0
tables pinned by `@oseo/unicode`, and the matcher consumes those same sets.
Dynamic construction validates that grammar and retains an immutable runtime
matcher descriptor. The runtime now compiles that descriptor into an owned
instruction program in *runtime\_regexp\_matcher.c* and executes it, so the
same choice, capture, Unicode, and resource behavior exists on both sides of
the boundary. A valid literal still reports the profile boundary.

Regular expressions are one M5 built-in family, but their implementation
crosses the source frontend, compiler representations, generated C, runtime
objects, Unicode data, string methods, and well-known symbol dispatch. Keeping
that work in a dedicated plan lets [*PLAN-M5.md*](./PLAN-M5.md) retain its
milestone-wide dependency order while this document owns the family-specific
contracts.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*PLAN-BACKEND.md*](./PLAN-BACKEND.md), [*PLAN-M5.md*](./PLAN-M5.md),
[*PLAN-GC.md*](./PLAN-GC.md), [*PLAN-PT.md*](./PLAN-PT.md),
[ADR 0013](./docs/adr/0013-m5-edition-and-manifest.md), the active language
profile, and accepted records under *docs/adr/*. Evidence that changes one of
those contracts updates the affected document in the same change.


Goal
----

Oseo should implement the complete regular expression family required by its
ECMA-262 16th edition candidate boundary. Literal patterns known during the
build should be parsed and compiled ahead of time. Evaluating a literal still
creates a fresh `RegExp` object with independent mutable state; only immutable
pattern artifacts may be shared.

Patterns supplied to the `RegExp` constructor at run time use the same owned
pattern representation and matching semantics. They do not cause Oseo to
compile JavaScript source, introduce executable code at run time, or add a
general interpreter. A compact matcher for dynamic pattern data is a private
regular expression implementation, not a JavaScript execution tier.

The family needs one semantic authority. An ahead-of-time matcher, a compact
generic matcher, and any later fast path must agree on captures, choice order,
Unicode behavior, indices, and failure. An optimization is accepted only after
it is compared with that authority across generated and standards evidence.


Non-goals
---------

This plan does not decide that every pattern becomes a deterministic finite
automaton. Backreferences, captures, assertions, and ECMAScript choice order
need representations that a plain DFA does not preserve. The probes may select
different strategies for different pattern regions.

It does not require one generated C function per literal. Direct C lowering,
serialized matcher instructions, static transition tables, and mixtures of
those forms remain candidates until compile-time, code-size, and run-time
measurements compare them.

It does not admit only a convenient regular subset under the `RegExp` name.
Unsupported syntax remains a source-located diagnostic until the complete
semantic unit required by the active profile is ready. An external library may
serve as an implementation component only if its observable behavior can meet
the candidate edition and Oseo owns every mismatch at a tested boundary.

Annex B is outside the candidate claim. The legacy
`RegExp.prototype.compile` surface therefore does not enter through this plan.
ECMA-402 locale behavior, host regular expression extensions, and a public
embedding API are also out of scope.


Entry evidence
--------------

Regular expression work starts from these implemented contracts:

 -  parser-owned nodes are converted to Oseo-owned syntax before compiler core
    processing;
 -  generic strings, arrays, objects, properties, functions, constructors,
    symbols, errors, abrupt completion, and collection have native semantics;
 -  symbol values, symbol-keyed properties, well-known symbol dispatch, the
    regular expression protocol symbols, `@@species`, and generic
    `ToPrimitive` behavior are implemented. The intrinsic step consumes
    `@@match` for `IsRegExp` and `@@species` for the constructor accessor;
    prototype and String dispatch remain in delivery item 5;
 -  the synchronous iterator protocol supplies the basis for future
    `String.prototype.matchAll` iterator behavior;
 -  generated C and the runtime are separate backend inputs, and the runtime is
    split into owned translation units behind one private internal header;
 -  specialization can be disabled, and every current guarded path retains a
    compiled generic fallback;
 -  Node.js, Deno, both native execution targets, AArch64 Linux cross-linking,
    strict warnings, sanitizers, and forced collection are ordinary evidence;
    and
 -  ADR 0013 fixes ECMAScript 2025 as the candidate edition and requires every
    gap inside that boundary to remain visible.

The active profile still rejects `RegExpLiteral` syntax. An unshadowed
`RegExp` reference now resolves to the intrinsic, whose callable and
constructible initialization surface is admitted. The literal step replaces
the remaining syntax diagnostic only for the semantic surface its tests
actually admit.


Semantic boundary
-----------------

The family enters as one coordinated set of syntax, intrinsic, object, string,
and protocol behavior. Internal checkpoints may land separately, but a public
profile update must state exactly which checkpoints are observable.

### Literal evaluation

The frontend records the literal pattern text, flag text, and source range
without retaining a bootstrap-parser node. It validates the flag set and
pattern grammar for the candidate edition before HIR construction. Invalid
literal patterns are early errors at their original source location. That
much is implemented: `parseRegExpLiteral` consumes the owned record, and a
rejected pattern reports `OSEO0001` at the offending text inside the
literal while a valid one reports the profile boundary at the literal.

Each evaluation allocates a distinct initialized `RegExp` object. Repeated
evaluation of one source occurrence and evaluation of two equal occurrences
must not reuse observable object identity or mutable `lastIndex` state.
Equal pattern artifacts may share immutable code, tables, strings, and Unicode
data when that sharing is not observable.

Literal compilation records enough source and flag metadata to implement the
`source`, `flags`, individual flag accessors, and `toString` behavior without
reconstructing text from a backend-private instruction stream.

### Constructor and initialization

`RegExp` becomes a real intrinsic with the specified call and construction
behavior, property attributes, prototype, species access, and subclass hooks
required by the active profile. Initialization handles strings, existing
regular expression objects, omitted values, explicit `undefined`, duplicate or
invalid flags, conversion order, and abrupt completion.

Patterns that are not known until execution are parsed and compiled into an
owned matcher artifact at run time. A syntax error becomes the specified
catchable `SyntaxError`; it does not escape as an Oseo diagnostic or a native
library error.

A later optimization may recognize a constructor call whose intrinsic
identity, arguments, conversions, and `newTarget` behavior are proven. Merely
seeing constant strings is not enough if shadowing, replacement, subclassing,
or conversion can be observed.

### Pattern and flag behavior

The owned pattern grammar covers every regular expression construct and flag in
the candidate edition. The parser and validator implement the main-body
grammar for every construct below except class set notation, which has no
owned representation yet. It recognizes and refuses that notation and inline
modifiers with located `unsupported` errors rather than early errors. Unicode
property escapes are admitted through the parser's named extension point when
the frontend's exact resolver finds their property set in the pinned tables;
an invalid name is an early error at the escape. Annex B is outside the claim,
so a construct only Annex B admits is rejected without the `u` flag too, which
*docs/regexp-inventory.md* lists exactly. The initial inventory includes:

 -  alternatives, sequences, assertions, greedy and non-greedy quantifiers;
 -  character escapes, classes, class set notation, and Unicode properties;
 -  numbered and named captures, duplicate names where the edition permits
    them, forward references, and references evaluated inside lookbehind;
 -  positive and negative lookahead and lookbehind;
 -  modifiers and the `d`, `g`, `i`, `m`, `s`, `u`, `v`, and `y` flags; and
 -  UTF-16 code-unit indexing, Unicode code-point traversal, case folding,
    word characters, and string-valued Unicode properties.

Choice order is observable through the selected match and capture contents. A
matcher may change its internal search algorithm only when it produces the
same match state that the edition requires.

### Execution state and results

The initialized object owns `lastIndex` with its specified property attributes.
Built-in execution performs the required conversions and updates for global and
sticky patterns, including failure, empty matches, Unicode advancement, and an
abrupt `lastIndex` access or write.

A successful match produces the required array, captures, `index`, `input`,
named `groups`, and optional `indices` and indices groups. Unmatched captures
remain `undefined`. All result objects and captured strings follow ordinary
allocation, rooting, descriptor, and collection rules.

The built-in matcher itself does not call user code after its inputs and object
state have passed the specified observable operations. Operations such as
`RegExpExec` still perform dynamic property lookup and call an overridden
`exec` where the specification requires it.

### Prototype and string integration

The family includes the constructor properties, prototype accessors and
methods, `RegExp.escape`, and the regular expression string iterator required
by the candidate edition. The well-known symbol methods cover matching,
match-all iteration, replacement, search, and splitting.

The corresponding `String.prototype` methods dispatch through the well-known
symbol protocol rather than recognizing only Oseo's built-in object kind.
Replacement preserves functional replacer calls, substitution text, named
captures, coercion order, and abrupt completion. Species construction and
overridden methods remain observable wherever the edition requires them.


Compiler and runtime architecture
---------------------------------

Regular expression compilation is a subpipeline with owned representations. It
does not leak bootstrap-parser pattern nodes into compiler core or ask the C
backend to recover pattern semantics from source text.

~~~~ mermaid
flowchart TD
    literal[Regular expression literal] --> buildParser[Build-time parser]
    dynamic[Dynamic constructor input] --> runtimeParser[Runtime pattern parser]
    buildParser --> matcher[Owned matcher IR]
    runtimeParser --> matcher
    matcher --> generic[Compact generic artifact]
    matcher --> native[Ahead-of-time C lowering]
    generic --> executor[Shared matcher executor]
    native --> function[Native matcher function]
    executor --> result[ECMAScript match state]
    function --> result
~~~~

The exact split between the owned pattern AST and matcher IR remains
provisional. The boundary must nevertheless preserve direction, captures,
choice priority, character sets, flag-dependent behavior, and source metadata.
A textual dump or validator should make malformed control flow and capture use
inspectable before backend lowering.
The matcher artifact decision belongs to this plan. The program
code-generation decision belongs to
[*PLAN-BACKEND.md*](./PLAN-BACKEND.md); matcher measurements may inform it
without selecting it.

### Ahead-of-time literal path

The build-time compiler parses each literal once and produces an immutable
matcher artifact. A backend may lower that artifact to a C function, static
transition tables, compact instructions stored in read-only data, or a measured
combination. The selected form is compiled and linked with the rest of the
closed program.

Generated JavaScript MIR creates a fresh object from a descriptor. It does not
contain one operation per pattern character or retain a pattern AST. The
descriptor connects original text and flags, capture metadata, Unicode data
references, and the selected matcher entry.

Identical immutable artifacts may be deduplicated within a linked program.
Deduplication keys include every edition, Unicode, flag, compiler-option, and
matcher-format fact that can change behavior. Object allocation and identity
are never deduplicated.

### Dynamic pattern path

The constructor cannot require executable-memory generation for an arbitrary
pattern string. Its parser and compiler produce a data artifact consumed by the
generic matcher. That component is linked when the reachable program can
construct a pattern dynamically; literal-only programs should not retain it
merely because the full runtime archive listed it as an input.

The runtime parser must not depend on Node.js, Deno, the bootstrap Babel
adapter, host locale data, or a system regular expression API. A self-hosted
implementation compiled from the admitted TypeScript subset and a C component
are both candidates. Their size, failure ownership, collector interaction, and
ability to share the build-time grammar need probe evidence.

### Shared semantic authority

The generic matcher is the executable oracle for optimization work. Static
matcher lowering and any later specialized strategy compare against it for the
same owned pattern, input, start index, and flags. The implementation should
share validators, canonical pattern fixtures, and match-state comparison even
if build-time and run-time parsers cannot share executable source initially.

That authority now exists. `buildRegExpMatcher` compiles one validated
pattern into an immutable artifact, and `matchRegExpMatcher` and
`searchRegExpMatcher` execute it. The artifact is a flat instruction
program over a register file: capture registers, repetition counters and
positions, and lookaround frames. It carries no mutable field and no
reference to a regular expression object, so equal artifacts may be shared
while every evaluation still owns its object identity and `lastIndex`.

The executor holds an explicit backtrack stack and an undo trail rather
than a native call stack, so backtracking depth is data and a later C
lowering needs no recursion. Every register write is trailed, so one
backtrack entry restores the whole state by truncating the trail. A
lookaround runs as an atomic submatch: its body's remaining choices are
discarded when it finishes, a positive assertion keeps the captures its
body set and restores the entry position, and a negative one restores
both and fails.

Choice order, capture reset and visibility, assertion and lookaround
behavior, backreference resolution, quantifier priority, empty-progress
failure, UTF-16 and code-point iteration, and canonicalization are frozen
by that pair. Positions are UTF-16 code-unit indices, and under `u` or `v`
they always name a code-point boundary: a start index that splits a
surrogate pair names the pair, and the search advances past the whole
pair, which is what
*test/built-ins/RegExp/prototype/exec/u-lastindex-adv.js* requires.

Ignore-case behavior is decided while the artifact is built. Each
consuming atom becomes one code-point set closed under the pattern's
canonicalization, and a negated class is complemented after that closing,
which is the order `CharacterSetMatcher` uses. Only a backreference has to
compare two input characters at run time, so only a pattern with both `i`
and a backreference carries a canonicalization table. The two unicode-mode flags
complement a property differently: `v` folds a property set before
complementing it over the folded code points, while `u` complements the
unfolded set and canonicalizes afterwards, so `\P{Ll}` accepts a lowercase
letter under `iu` and refuses it under `iv`.

An inline modifier group has no matcher lowering: the unit that admits
that syntax owns its flag scoping, and until then the builder refuses it
with a located error rather than matching it with the outer flags.

An ahead-of-time path that implements the complete matcher IR does not need a
run-time guard merely because it is native code. A path that assumes a string
layout, simple case-folding class, bounded capture count, or other narrower
condition needs an explicit guard and a tested edge to the generic matcher
before it commits observable state.

### Object and collector ownership

An initialized regular expression object holds its original source and flags,
mutable `lastIndex`, and a reference to an immutable matcher artifact. Static
artifacts may live in read-only native storage. Dynamic artifacts need an owned
lifetime and tracing rule before allocation can collect.

Matcher work stacks, capture registers, temporary character sets, and result
construction must not retain unrooted heap pointers across a safepoint.
Backtracking must not use unbounded native C recursion. An explicit work area
has a checked size and an owned allocation failure path.

Managed edges use the slot and descriptor contract in
[*PLAN-GC.md*](./PLAN-GC.md). Native work areas and dynamic matcher backing
stores report their retained bytes through its accounting categories even when
they remain outside the movable heap.


Probes and decisions
--------------------

The first probes compare representations rather than choosing one by taste.
They use patterns drawn from test262, real dependency-free packages, and
reviewed stress cases.

### Matcher strategy

At least three implementation shapes need comparison:

 -  a compact ordered matcher that preserves the specification's choice and
    capture behavior;
 -  an automaton path for patterns or regions proven regular; and
 -  direct generated C for patterns whose native control flow stays smaller or
    faster than the compact form.

The probe records pattern coverage, match throughput, first-use cost, temporary
memory, generated C size, object size, final executable size, C compilation
time, and failure behavior. It includes captures, lookaround, backreferences,
empty matches, large bounded repetitions, Unicode sets, and adversarial choice
graphs. A strategy that handles only a subset records its exact fallback.

A pure DFA is accepted only for a proven subset and only with a size limit.
State explosion must select another reviewed representation at build time
instead of exhausting the compiler or silently truncating behavior.

### Owned implementation or external component

An external engine probe must cover the complete candidate grammar and match
semantics, static-link support, both execution targets, the AArch64 Linux
cross-link, license compatibility, Unicode version control, sanitizer behavior,
thread and locale assumptions, allocator injection, error translation, and
binary size.

Missing observable behavior is not filled with unreviewed wrappers around the
library. The probe lists each mismatch and measures the owned code needed to
close it. An architecture decision then selects an owned implementation, an
external component behind an Oseo adapter, or a composed design.

### Matcher artifact and backend boundary

The artifact decision defines:

 -  a validated backend-neutral matcher representation;
 -  whether static artifacts are serialized data, generated C, or both;
 -  how capture, source, flag, edition, and Unicode metadata are recorded;
 -  whether identical artifacts are deduplicated and at what linking scope;
 -  how the runtime ABI identifies the matcher format;
 -  how generated and generic paths report resource failure; and
 -  which textual or structural dump supports tests and diagnosis.

The format is private while M5 is active. A persistent cache or independently
loaded artifact would make its version and validation a larger compatibility
contract and requires a separate decision.

### Unicode data

The Unicode version and data inputs are pinned build dependencies. Generated
tables are reproducible, reviewed artifacts rather than results derived from
the host locale or C library. The probe compares table layouts for code-point
properties, string properties used by Unicode sets, case folding, and word
characters.

Static literal compilation may precompute referenced sets, while dynamic
patterns need the tables required to resolve arbitrary admitted properties.
Capability-aware runtime composition records that difference without changing
semantics.

The pinning half of this now exists. `@oseo/unicode` holds one reviewed copy
of the Unicode Character Database for Unicode 17.0.0, pinned by URL, byte
length, and SHA-256 in *packages/unicode/data/manifest.yaml*, and the tables
generated from it. It covers `General_Category`, `Script`, and
`Script_Extensions`, every binary property in table 70 of ECMA-262, simple and
full case folding, the simple and unconditional full case mappings, the
conditional mappings of *SpecialCasing.txt* recorded but not applied, and both
ECMAScript word-character sets. Sets are inversion lists, so a matcher may
lower one into generated C without reshaping it. `mise run unicode:update`
regenerates the tables and `mise run check:unicode-tables` fails when the
checked-in module is not what the pinned inputs produce, offline in both
directions.

The generic matcher reads the tables through its caller rather than
directly, so the builder resolves `\d`, `\s`, `\w`, `\p`, and every
ignore-case closure into inversion lists while the artifact is built and
the executor needs no table at all. That keeps the package boundary and
already gives an artifact one native lowering could consume unchanged.

Two pieces remain. Properties of strings, which only the `v` flag needs,
are out of scope for that package: they are sequence rather than code-point
properties and need emoji sequence files it does not pin, so the unit that
admits class set notation owns them. The runtime-side representation is also
still open, because the tables are build-time data today and no matcher reads
them yet; the probe still owns the comparison of candidate table layouts and
of what a dynamic pattern must carry into the runtime.

### Resource behavior

The probe includes patterns known to cause large backtracking trees, large
automata, many captures, deep assertions, and repeated empty matches. It records
compile work, match work, temporary memory, native stack use, and cleanup after
failure.

Oseo must not add a silent timeout or return a false match result to cap work.
Any implementation-defined resource failure needs an owned, testable boundary
consistent with the candidate edition and the runtime's existing allocation
policy. Avoiding pathological work through a semantics-preserving algorithm is
preferred to imposing a new observable limit.

The generic matcher's boundaries are those of the artifact and of one
attempt. Building one reports a located `limit` error when a pattern needs
more instructions or registers than the reviewed limits allow. Executing
one reports a distinct `limit` outcome naming the boundary reached, over
instruction steps, backtrack entries, and trail entries. Each boundary is
deterministic, so the same artifact, input, and limits produce the same
answer on every host and target, and lowering a limit can only replace an
answer with that failure rather than with a different match.

The runtime applies the same boundaries to the program it compiles from a
dynamic pattern, and a reached boundary is one source-located `OSEO2001`
diagnostic rather than an observable language value.


Optimization contract
---------------------

Literal compilation begins as removal of repeated parsing and pattern
compilation, not as a claim that every match is faster. Performance reports
separate build cost, first-use latency, steady-state match time, allocation,
and executable size.

Optimization proceeds in measured layers:

1.  Compile literal patterns into a validated immutable artifact during the
    build.
2.  Deduplicate equal static artifacts without sharing object state.
3.  Lower a proven matcher-IR subset directly to C when it improves the
    reviewed workloads within the code-size budget.
4.  Add input or representation fast paths only with explicit guards and a
    generic matcher edge.

The build may select a compact representation when direct C would exceed a
reviewed size limit. That selection is a compile-time backend choice and does
not make JavaScript hints correctness requirements.


Property and differential evidence
----------------------------------

Regular expression properties extend [*PLAN-PT.md*](./PLAN-PT.md). They keep a
structured pattern model until printing so shrinking can preserve capture
indices, group names, assertion direction, Unicode mode, and reference
validity. The pattern domain exists at seeds `0x60004a00` and `0x60004a01`.
Until a matcher exists it observes structure rather than match state: the
host engine decides validity and reports its own capture count and group
names, and a summary walk over the model is compared with one over the
parsed tree. Pattern characters already cover the empty pattern, ASCII,
syntax characters, embedded NUL, non-ASCII BMP code points, lone
surrogates, and supplementary code points; the match-input half of the
domain lands with the matcher that consumes it.

The invalid domain applies one mutation to a valid case and asserts the
exact error kind, section, and span. Its mutations cover escapes, class
ranges, quantifier bounds, a quantifier without an atom, group names,
numbered and named references, a property escape without a resolver, an
unadmitted class set, a repeated flag, an undefined flag, and incompatible
`u` and `v` flags. The host is a one-directional oracle, since it
implements Annex B and this grammar does not, so host agreement is
required for a flag error and for a pattern error under a unicode-mode
flag, and never for an unadmitted construct, which is valid ECMAScript
this unit refuses on purpose.

The Unicode property checkpoint adds three generated domains in reserved seed
block `0x60004e00` through `0x60004eff`. Seed `0x60004e00` compares every
character class escape with the host engine across Unicode and ignore-case
modes. Seed `0x60004e01` chooses exact binary, General\_Category, Script, and
Script\_Extensions aliases from the pinned tables and compares positive and
negative escapes. Seed `0x60004e02` mutates canonical forms into invalid
property expressions and asserts the owned parser's exact kind, section,
message, and source span as well as the host's early rejection. The valid
domains generate code points directly and retain the Unicode version, seed,
and replay path in every failure. The host rejects the retained `Hrkt` alias,
so that empty Script value instead uses its absence from both pinned
assignment files as an independent oracle.

The valid generator starts with a bounded candidate-edition grammar. It
constructs alternatives, sequences, quantifiers, classes, assertions,
captures, and references directly. It generates references only to permitted
groups and chooses flags before generating flag-sensitive syntax. Inputs cover
empty strings, ASCII, non-ASCII BMP code units, lone surrogates, supplementary
code points, combining sequences, embedded NUL, and long repeated prefixes.

The invalid generator applies one controlled mutation to a valid pattern or
flag set. Mutations cover invalid escapes, ranges, quantifiers, group names,
references, Unicode properties, class set operations, duplicate flags, and
incompatible `u` and `v` flags. A property asserts the exact early or run-time
failure phase, catchable error identity where applicable, and source location.

Independent observations compare:

 -  literal evaluation with `new RegExp` for the same source and flags where
    the specification makes their matcher behavior equivalent;
 -  Node.js and Deno with the generic matcher and every ahead-of-time strategy;
 -  repeated fresh literal objects with independent `lastIndex`;
 -  specialization-disabled and specialization-enabled execution;
 -  ordinary collection and collection forced at every matcher allocation
    safepoint; and
 -  a compact match-state model for bounded regular patterns where that model
    is independent of the implementation.

Failure records include the pattern model, printed pattern and flags, input,
start index, expected and actual captures and indices, matcher strategy,
Unicode data version, seed, replay path, profile, target, collector mode, and
retained generated artifact. A minimized failure becomes an ordinary fixture
before the implementation is fixed.


Example, structural, and standards evidence
-------------------------------------------

Example-based tests retain contracts that generated comparison alone cannot
prove economically:

 -  literal identity, independent `lastIndex`, descriptors, source escaping,
    and intrinsic identity;
 -  constructor call, construction, conversion, subclass, and species order;
 -  alternative and quantifier choice order with capture clearing;
 -  forward and backward assertions, references, and empty-match advancement;
 -  every flag alone and in relevant combinations;
 -  named captures, match indices, replacer arguments, and substitution text;
 -  overridden `exec` and every well-known symbol dispatch path;
 -  Unicode code units, code points, properties, sets, folding, and lone
    surrogates; and
 -  abrupt completion and collection at object, artifact, work-area, capture,
    result, iterator, and replacement allocation points.

Structural tests inspect matcher IR and generated C. They prove that a literal
does not parse or compile its pattern at run time, equal artifacts can be
deduplicated without sharing wrappers, selected direct paths contain the
expected control flow, and every guarded optimization retains its generic edge.

The reviewed test262 corpus grows by semantic dependency. It begins with
literal early errors and object identity, then initialization and built-in
execution, prototype methods, symbols and string integration, Unicode behavior,
and the complete candidate-edition directories. ADR 0013's dependency
vocabulary is extensible through a reviewed amendment to that record, and one
now admits the `regular-expressions` tag. The Unicode property checkpoint
still selects its 625 paths through existing dependency tags; moving reviewed
rows onto the new tag is a separate reviewed change. Unsupported results move
only after every requested strictness and specialization variant executes.

Native evidence runs on Linux AMD64 and macOS AArch64. AArch64 Linux
compile-links and exposes static matcher artifacts and generated control flow
for inspection. Changes to pattern lowering, matcher state, Unicode tables, or
runtime allocation run the ordinary native, property, extended-property, and
test262 gates required by [*CONTRIBUTING.md*](./CONTRIBUTING.md).


Delivery order
--------------

1.  Inventory the ECMAScript 2025 clauses, test262 directories, flags,
    prototypes, symbol hooks, Unicode inputs, and current parser diagnostics.
    Extend the manifest dependency vocabulary without changing
    classifications. The inventory landed in
    [*docs/regexp-inventory.md*](./docs/regexp-inventory.md). The vocabulary
    extension did not land with it, and this item was marked complete while
    the `regular-expressions` tag was still absent from both ADR 0013 and the
    enforced set in *packages/testkit/src/index.ts*. A reviewed amendment to
    ADR 0013 now admits the tag and the enforced set carries it, which
    completes the item. No reviewed row carries the tag yet, so no
    classification moved. Whether the reviewed RegExp rows that currently
    carry `functions` or `object-properties` gain the tag is a separate
    reviewed change, and ADR 0013 records that they gain it alongside those
    tags rather than exchanging one for another.
2.  Define an Oseo-owned pattern AST, parser contract, validator, and bounded
    generated pattern model. Retain literal text and flags at the frontend
    boundary without admitting execution. Landed. The parser reports one
    located error per rejected construct, separating an early error from an
    unadmitted construct and from an owned resource limit, and the generated
    domain at seeds `0x60004a00` and `0x60004a01` keeps the structured model
    until it prints source.
3.  Implement and test a generic matcher artifact and executor for the complete
    admitted pattern grammar. Freeze its choice, capture, Unicode, and resource
    behavior before adding native literal lowering. Landed, in
    `@oseo/compiler`, with an instruction dump, reviewed artifact and
    execution limits, and a generated domain at seeds `0x60004d00` and
    `0x60004d01`. The compiler core still links no Unicode data, so the
    builder takes case-equivalence classes, `Space_Separator`, and property
    escape sets from its caller and refuses a pattern whose facts the caller
    did not supply. Item 5 links the artifact to dynamic construction, while
    item 6 connects it to match execution and result construction.
4.  Resolve Unicode property escapes and character class escapes from the
    pinned Unicode tables. Landed. The frontend and matcher share one exact
    ECMA-262 property resolver, invalid names retain source-located early
    diagnostics, and generated evidence at seeds `0x60004e00` through
    `0x60004e02` compares the generic matcher with the host engine. This
    checkpoint adds no specialized matcher, allocation, generated-code entry
    point, or built-in code range.
5.  Add the `RegExp` intrinsic, allocation, initialization, `lastIndex` state,
    subclass and `newTarget` behavior, and catchable dynamic-pattern errors.
    Trace dynamic artifacts. Landed with seeds `0x60004f00` and `0x60004f01`,
    runtime ABI `oseo-runtime-m5-75`, and built-in range index 16. Escaped and
    non-ASCII group names and non-ASCII identity escapes retain an `OSEO2001`
    boundary until their Unicode identifier data is linked.
6.  Add built-in execution and result construction, prototype methods and
    accessors, `RegExp.escape`, the regular expression string iterator,
    well-known symbol methods, and String method dispatch. Trace matcher work
    areas and results. Built-in execution, the match result object, `exec`,
    `test`, `toString`, and the `source`, `flags`, and individual flag
    accessors landed with seeds `0x60005000` through `0x60005002`, runtime
    ABI `oseo-runtime-m5-77`, and the *runtime\_regexp\_matcher.c*
    component; the artifact's program is unmanaged memory the collector
    releases with the artifact, and execution allocates nothing managed and
    reaches no safepoint. Simple case folding maps nothing outside ASCII
    into ASCII except U+017F and U+212A, so the runtime resolves an ASCII
    closure exactly and keeps an `OSEO2001` boundary for a set that meets a
    non-ASCII class and for an ignore-case backreference in a pattern whose
    sets can reach one. `RegExp.escape`, the string iterator, the symbol
    methods, and String dispatch remain.
7.  Compile literal patterns during the build, emit immutable descriptors, and
    allocate a fresh wrapper at each evaluation. Compare this path with the
    generic matcher under both specialization policies and forced collection.
8.  Run the matcher-strategy, external-component, Unicode-table, resource, and
    code-size probes. Record the selected backend and runtime split in an
    architecture decision before it becomes a later family dependency.
9.  Add measured direct-C, automaton, string-search, or representation fast
    paths one at a time. Each lands with a structural guard or applicability
    proof and generic comparison.
10. Expand the reviewed and generated corpus to the complete
    candidate-edition boundary, update the M5 profile and compatibility
    manifest, and remove the regular expression gap only when no applicable
    unsupported result remains.

Each checkpoint keeps unsupported behavior explicit. Commands are documented
only after they exist, and a partial internal checkpoint does not make the
whole `RegExp` family part of the public profile.


Exit criteria
-------------

This plan is complete when:

 -  regular expression literals validate and compile through Oseo-owned
    representations without retaining bootstrap-parser nodes;
 -  each literal evaluation creates a fresh object while immutable matcher
    artifacts are safely shared and deduplicated;
 -  dynamic construction uses the same pattern and match semantics without
    JavaScript source compilation or run-time executable-code generation;
 -  the complete candidate-edition pattern grammar, flag set, intrinsic,
    prototype, iterator, well-known symbol, String integration, capture,
    indices, replacement, and Unicode behavior is implemented;
 -  invalid literals and dynamic patterns fail at the specified phase with
    owned locations and catchable error identity where required;
 -  the matcher has explicit collector, work-area, resource, artifact-version,
    and runtime-composition contracts;
 -  ahead-of-time and generic matching agree with Node.js, Deno, test262, both
    specialization policies, and forced collection across the reviewed corpus;
 -  every generated strategy and fast path stays within published compile-time,
    code-size, allocation, native-stack, and latency budgets;
 -  Linux AMD64 and macOS AArch64 execute the complete semantic corpus, while
    AArch64 Linux retains compile-link and structural evidence;
 -  generated pattern failures shrink to valid, replayable cases and leave
    ordinary regression fixtures;
 -  the active profile and compatibility manifest contain no regular
    expression gap inside the candidate claim; and
 -  `mise run check`, `mise run test`, the required native, property,
    extended-property, and test262 tasks pass from a clean checkout.
