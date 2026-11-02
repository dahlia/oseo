Post-M5 language compatibility plan
===================================

Status
------

Implementation status: planned, not started. This plan follows M5 directly and
runs alongside M6. It has no milestone number. It schedules the language work
the maintainer approved on 2026-11-02: build-time static-specifier `import()`,
Annex B legacy web behavior except `document.all`, the legacy `caller`
extension, the seven ECMAScript 2026 features, and the three ECMAScript 2027
features other than Temporal.

The plan is written for parallel implementation. Each work unit below owns an
exact set of test262 paths, names its prerequisites, and lists the shared files
it must serialize with other units. Units may run in separate worktrees at the
same time; they land one at a time.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*PLAN-DYN.md*](./PLAN-DYN.md), [*PLAN-REGEXP.md*](./PLAN-REGEXP.md),
[*PLAN-GC.md*](./PLAN-GC.md), [*PLAN-PT.md*](./PLAN-PT.md),
[*PLAN-GATE.md*](./PLAN-GATE.md), the
[*M5 language profile*](./docs/language-profile-m5.md), the
[*M5 exit report*](./docs/m5c-closure/m5-exit-report.md), and the records under
*docs/adr/*. Evidence that changes one of those contracts updates the affected
document in the same change.


Goal
----

At the end of this plan, Oseo's measured claim covers ECMAScript 2026, Annex B
without `[[IsHTMLDDA]]`, and three finished ECMAScript 2027 features. Every path
those additions bring into the applicable inventory is a pass, an expected
negative, or an unsupported result owned by
[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md). The legacy `caller`
extension and literal `import()` replace the M5 exclusions and deferrals that
covered them.

The plan does not change Oseo's execution model. Every admitted construct
compiles ahead of time to native generic code, may add guarded specialization,
and runs without an interpreter. No unit adds run-time source compilation.


Out of scope
------------

 -  Proposal-stage features, including import defer, source phase imports,
    ShadowRealm, decorators, `await` dictionaries, immutable `ArrayBuffer`,
    import text and bytes, the error stack accessor, nonextensible private
    elements, and the legacy RegExp features proposal (`RegExp.$1` and the
    other static accessors). Their paths stay excluded by the proposal rule.
 -  Temporal, which [*PLAN-TEMPORAL.md*](./PLAN-TEMPORAL.md) owns as a separate
    track.
 -  ECMA-402 and *test/intl402/*, which [*PLAN-INTL.md*](./PLAN-INTL.md) owns.
 -  `[[IsHTMLDDA]]` and every test that needs `$262.IsHTMLDDA`.
 -  `eval`, the `Function` constructor family, and unrestricted dynamic import.
    ADR 0016 keeps them outside the profile and
    [*PLAN-DYN.md*](./PLAN-DYN.md) owns their track.
 -  `AsyncLocalStorage` and TC39 AsyncContext, which
    [*PLAN-ASYNCCTX.md*](./PLAN-ASYNCCTX.md) covers.


Starting point
--------------

The M5 exit report measures the fixed 41,091-path inventory at test262 revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`: 34,778 passes, 4,401 expected
negatives, and 1,912 unsupported results. The unsupported results are 1,838
exclusions (11 under ADR 0013 for Annex B, 1,804 under ADR 0016, 23 under ADR
0028) and 74 named deferrals under ADR 0031, all with *PLAN-DYN.md* as their
target: 54 `run-time-source` and 20 `static-specifier-import`.

The reference hosts are the pinned Node.js 24.21.0 and Deno 2.9.7. Both expose
the Annex B built-ins, `Array.fromAsync`, `JSON.rawJSON`, `Error.isError`,
`DisposableStack`, `SuppressedError`, `using` declarations, and
`Atomics.pause`. Only Deno exposes the upsert methods, `Uint8Array` base64,
`Iterator.concat`, and `Math.sumPrecise`. Neither exposes `Iterator.zip`.
These are presence checks, not conformance results.

### Annex B pieces that already exist

A probe of the current build and the reviewed manifest shows this Annex B state:

| Annex B behavior                                   | Current state                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| HTML-like comments in Script code                  | Accepted by the parser and compiled; rejected in modules; no reviewed row yet |
| Legacy octal literals, `\8`, `\9`, octal escapes   | Core grammar in the inventory; non-strict rows pass                           |
| `__proto__: value` in object initializers          | Core syntax, admitted by M5a Unit 8.1c                                        |
| `var` redeclaring a simple catch parameter         | Admitted by M5a Unit 8.5c, including `for (var e of ...)`                     |
| `WeakRef.prototype.constructor`                    | Installed; its path is excluded from the inventory                            |
| `Object.prototype.__proto__` accessor              | Distinct getter and setter identities exist; invoking either reports OSEO1001 |
| `__lookupGetter__`, `__lookupSetter__`             | Not installed; a lookup reaching `Object.prototype` reports OSEO1001          |
| `__defineGetter__`, `__defineSetter__`             | Not installed                                                                 |
| Annex B RegExp pattern grammar                     | Reported as the OSEO1001 profile boundary, without `u` or `v`                 |
| `escape`, `unescape`                               | Not installed; a reference is a `ReferenceError`                              |
| `substr`, HTML methods, `trimLeft`, `trimRight`    | Not installed; a call is a `TypeError`                                        |
| `getYear`, `setYear`, `toGMTString`                | Not installed                                                                 |
| `RegExp.prototype.compile`                         | Not installed                                                                 |
| Labelled function declarations                     | Rejected with OSEO1001                                                        |
| Function declarations in `if` clauses              | Rejected with OSEO1001                                                        |
| Block-level function web legacy semantics          | Not implemented; duplicate block functions are early errors                   |
| `for (var x = init in obj)`                        | Rejected with OSEO1001                                                        |
| Function call assignment targets as runtime errors | Not implemented                                                               |

The `__proto__` boundary is documented in the
[omitted legacy accessor metadata contract](./docs/language-profile-m5.md#omitted-legacy-accessor-metadata-boundary).
The block-level function boundary is documented beside M5a Units 8.5d and 8.5e
in the same profile.


Claim boundary
--------------

The paths for this work lie outside the M5 inventory, so no unit can admit
them until the boundary moves. Proposed
[ADR 0032](./docs/adr/0032-post-m5-edition-boundary.md) moves it. It measures
ECMAScript 2026 plus explicit resource management, joint iteration, and
`Atomics.pause`, includes Annex B except `[[IsHTMLDDA]]`, and keeps Temporal,
ECMA-402, and proposals outside. ADR 0016 stays in force. The test262 revision
does not change.

At the pinned revision, the rule in ADR 0032 adds 1,916 included paths:

| Source                                            | Paths |
| ------------------------------------------------- | ----: |
| Seven ECMAScript 2026 features                    |   310 |
| Three ECMAScript 2027 features                    |   511 |
| Normative-optional paths under *test/built-ins/*  |    70 |
| *test/annexB/* without IsHTMLDDA or legacy-regexp | 1,025 |
| Total                                             | 1,916 |

The inventory grows from 41,091 to 43,007 included paths. Of the 1,086
*test/annexB/* files, 35 need IsHTMLDDA and 26 carry the `legacy-regexp`
proposal flag; those 61 stay excluded. A source scan finds 477 of the included
*test/annexB/* paths calling `eval` or a `Function` constructor, almost all
under *test/annexB/language/eval-code/*. They enter the inventory and become
ADR 0016 results. That count is a planning estimate; the reviewed observations
decide each row.

The `caller` work and literal `import()` change rows already inside the
inventory, so neither waits for ADR 0032.

The track also needs three further records:

 -  ADR 0032 itself, accepted before the `claim-boundary` unit lands;
 -  the ADR 0016 amendment proposed in the
    [static-specifier import design](./docs/static-specifier-import-design.md),
    accepted before `import-requests` starts admitting syntax; and
 -  a successor to
    [ADR 0028](./docs/adr/0028-legacy-function-caller-boundary.md) that defines
    the `caller` contract below, accepted before `legacy-caller` lands.


Contracts shared by the units
-----------------------------

### Annex B

Annex B behavior applies exactly where the edition applies it. HTML-like
comments exist only in the Script goal. The Annex B pattern grammar applies
only without the `u` and `v` flags, to literals and to patterns that `RegExp`
and `compile` validate at run time alike. The function declaration, `for-in`
initializer, and call assignment target rules apply only to non-strict code.
Strict code and modules keep every early error they report today.

The Annex B built-ins exist in every realm, including realms that
`$262.createRealm` creates under
[ADR 0027](./docs/adr/0027-realms-beyond-the-initial-realm.md).
`String.prototype.trimLeft` and `trimRight` are the same function objects as
`trimStart` and `trimEnd`, as the edition requires.

Installing a legacy method changes own keys and descriptors that other included
rows observe. Each Annex B unit therefore re-observes the whole manifest, not
only its own rows, and explains every changed record.

### Legacy `caller`

The successor to ADR 0028 fixes this contract. V8, as observed in Node.js
24.21.0, is the reference wherever the edition leaves a choice.

 -  A non-strict `function` declaration or expression that is neither async
    nor a generator has an own `caller` property. V8 reports it as a data
    property that is non-writable, non-enumerable, and non-configurable, and
    whose value is read at access time. Clause 17.1's restrictions stay
    intact: built-in, strict, arrow, method, class, generator, and async
    functions get no own `caller`.
 -  While the function is active, the value is the function whose code made the
    most recent call to it, which may be a non-strict async or generator
    function. Otherwise it is `null`.
 -  The value is never a strict function. A call from strict code, from a
    built-in such as `Array.prototype.map`, or from top-level Script or module
    code reports `null`.
 -  `Function.prototype.call` and `apply` report the function that invoked
    them, not the built-in. A bound function reports the caller of the bound
    function.
 -  Recursion reports the caller of the most recent activation. Unwinding an
    exception restores the previous activation's answer.
 -  A strict tail call never changes the answer. If strict `g` tail-calls
    non-strict `f`, `f.caller` is `null`, although Oseo has replaced `g`'s
    frame.
 -  Specialization and collection policy do not change any answer. The unit
    measures the per-call cost of tracking activations and keeps programs that
    never read `caller` within a recorded budget.

How a caller in another realm is reported is observed on V8 and recorded by the
successor record before implementation.

### Explicit resource management

A `using` or `await using` declaration opens a cleanup region in the sense of
[ADR 0017](./docs/adr/0017-structured-cleanup-regions.md). Every transfer that
leaves the scope runs the disposals in reverse order of declaration, and a
transfer that stays inside does not. A disposal error replaces the completion
with a `SuppressedError` that keeps the earlier error as `suppressed`.

`await using` suspends inside that cleanup. The stored completion must then
live in the suspended frame of
[ADR 0011](./docs/adr/0011-asynchronous-continuations.md), not only in the
completion slots ADR 0017 describes. That is one of ADR 0017's replacement
triggers. If the current representation cannot hold it, the `using-declarations`
unit amends ADR 0017 before landing.

### Static-specifier `import()`

The [static-specifier import design](./docs/static-specifier-import-design.md)
is the specification. It admits only `import()` with one string literal
argument, resolves the target during the build, and adds a runtime module
evaluation driver that static imports also use. This plan adds no semantics to
it.


Work units
----------

The table summarizes ownership. “New” counts paths that ADR 0032 adds to the
inventory; “existing” counts rows already in it whose owner moves to the unit.

| Unit                               | Owned paths                           | Requires                                        |
| ---------------------------------- | ------------------------------------- | ----------------------------------------------- |
| `claim-boundary`                   | 1,916 new rows, until handed to units | ADR 0032 accepted                               |
| `import-driver`                    | none; re-observes module rows         | none                                            |
| `import-requests`                  | none                                  | ADR 0016 amendment accepted                     |
| `import-operation`                 | none                                  | `import-driver`, `import-requests`              |
| `import-admission`                 | 20 existing deferrals                 | `import-operation`                              |
| `legacy-caller`                    | 23 existing                           | successor to ADR 0028 accepted                  |
| `annexb-syntax`                    | 28 new, 1 existing                    | `claim-boundary`                                |
| `annexb-escape`                    | 35 new                                | `claim-boundary`                                |
| `annexb-string-methods`            | 105 new                               | `claim-boundary`                                |
| `annexb-date-methods`              | 24 new                                | `claim-boundary`                                |
| `annexb-regexp-compile`            | 24 new                                | `annexb-syntax`                                 |
| `annexb-object-accessors`          | 70 new, 8 existing                    | `claim-boundary`                                |
| `annexb-function-declarations`     | 313 new                               | `claim-boundary`                                |
| `annexb-statement-forms`           | 19 new                                | `claim-boundary`                                |
| `annexb-dynamic-source-accounting` | 477 new, 2 existing                   | `annexb-syntax`, `annexb-function-declarations` |
| `error-is-error`                   | 12 new                                | `claim-boundary`                                |
| `math-sum-precise`                 | 10 new                                | `claim-boundary`                                |
| `upsert`                           | 72 new                                | `claim-boundary`                                |
| `array-from-async`                 | 95 new                                | `claim-boundary`                                |
| `uint8array-base64`                | 68 new                                | `claim-boundary`                                |
| `iterator-concat`                  | 32 new                                | `claim-boundary`                                |
| `json-parse-source`                | 21 new                                | `claim-boundary`                                |
| `disposal-intrinsics`              | 240 new                               | `claim-boundary`                                |
| `using-declarations`               | 184 new                               | `disposal-intrinsics`                           |
| `iterator-zip`                     | 82 new                                | `claim-boundary`                                |
| `atomics-pause`                    | 5 new                                 | `claim-boundary`                                |
| `language-exit-audit`              | none                                  | every other unit                                |

The new-row counts add up to 1,916. Implementation may start before a unit's
prerequisites land: fixtures, runtime components, and differential tests need
no inventory change. Admitting test262 rows waits for the prerequisites.

~~~~ mermaid
graph TD
  adr32[ADR 0032 accepted] --> boundary[claim-boundary]
  adr16[ADR 0016 amendment] --> requests[import-requests]
  driver[import-driver] --> operation[import-operation]
  requests --> operation
  operation --> admission[import-admission]
  adr28[ADR 0028 successor] --> caller[legacy-caller]
  boundary --> syntax[annexb-syntax]
  boundary --> escape[annexb-escape]
  boundary --> strings[annexb-string-methods]
  boundary --> date[annexb-date-methods]
  syntax --> compile[annexb-regexp-compile]
  boundary --> object[annexb-object-accessors]
  boundary --> functions[annexb-function-declarations]
  boundary --> statements[annexb-statement-forms]
  syntax --> dynsrc[annexb-dynamic-source-accounting]
  functions --> dynsrc
  boundary --> es2026[seven ES2026 units]
  boundary --> disposal[disposal-intrinsics]
  disposal --> using[using-declarations]
  boundary --> zip[iterator-zip]
  boundary --> pause[atomics-pause]
  admission --> exit[language-exit-audit]
  caller --> exit
  compile --> exit
  escape --> exit
  strings --> exit
  date --> exit
  object --> exit
  statements --> exit
  dynsrc --> exit
  es2026 --> exit
  using --> exit
  zip --> exit
  pause --> exit
~~~~

### `claim-boundary`

This is the first unit and the only one that changes the inventory. It applies
ADR 0032 to *tests/test262/inventory-policy.yaml*, regenerates
*tests/test262/inventory.tsv*, and adds every new path to the reviewed subset.

Most new ES2026 and ES2027 rows carry a feature flag that is absent from
`supportedFeatures`, so the existing frontmatter rejection records them as
unsupported without running them. Most *test/annexB/* rows have no flag and
would run, and many would fail. The unit adds a reviewed path-selector gate to
the runner that records each unadmitted Annex B row as unsupported with a
named capability, one per owning unit. A row that already passes, such as the
HTML-like comment and catch redeclaration rows, may be admitted here.

The unit also hands each new unsupported row to its owning unit in the closure
ledger, and moves the 11 ADR 0013 Annex B rows to `annexb-syntax`,
`annexb-object-accessors`, and `annexb-dynamic-source-accounting`. It freezes
the generated section of the M5 exit report, as ADR 0032 decides, and points
the exit audit, the compatibility ratchet, and the evidence-lane check at the
expanded inventory. It decides where the new family records live: the M5
profile index or a successor profile.

Done when the regenerated inventory has 43,007 included paths or the unit
explains each difference, the reviewed subset and manifest cover all of them,
no row is a failure, and every unsupported row has an owner.

### Static-specifier `import()` units

The four units implement the five implementation units of the design, with its
row accounting folded into the last one. Their gates are the design's test
groups G1 through G14.

 -  `import-driver` replaces the compiled module evaluation schedule with the
    runtime driver for static graphs only. It changes the runtime ABI and
    re-observes every module row; each changed static observation is explained.
    It needs no amendment because it admits nothing.
 -  `import-requests` converts the admitted form, records Script referrers,
    discovery edges, and request records, and reports build diagnostics. The
    profile still rejects `import()` until `import-admission`.
 -  `import-operation` implements EvaluateImportCall, ContinueDynamicImport,
    fresh capabilities, cached results, and asynchronous settlement on both
    execution targets.
 -  `import-admission` adds runner support for Script referrers and fixtures,
    changes `supportedFeatures`, re-observes all 630 `dynamic-import` rows, and
    reassesses the ADR 0016 exclusions the design reopens. It moves the 17
    closable deferral rows to observation owners. *usage-from-eval.js*,
    *eval-rqstd-once.js*, and *update-to-dynamic-import.js* stay deferred to
    *PLAN-DYN.md*.

Done when the 17 rows pass, every changed `dynamic-import` observation is
reviewed, no static module row regresses, and the amended ADR 0016 describes
the admitted subset.

### `legacy-caller`

The unit implements the `caller` contract above and replaces ADR 0028 with its
successor. It owns ADR 0028's 23-path selector. The 18 paths that use no dynamic
source should pass. The other five call `eval` or a `Function` constructor:

 -  *test/built-ins/Function/15.3.5.4\_2-12gs.js* (`eval`)
 -  *test/built-ins/Function/15.3.5.4\_2-14gs.js* (`eval`)
 -  *test/built-ins/Function/15.3.5.4\_2-76gs.js* (`eval`)
 -  *test/built-ins/Function/15.3.5.4\_2-77gs.js* (`Function`)
 -  *test/built-ins/Function/15.3.5.4\_2-78gs.js* (`new Function`)

They remain unsupported through the OSEO1001 rejection, and the unit gives them
to ADR 0016 through reviewed exclusion audit rows. The 18 passes and the fixed
fixtures are the replacement evidence for their `caller` subject.
*PLAN-DYN.md* records them as residue.

Own `caller` properties change the own keys of every non-strict function, so
the unit re-observes the manifest and reviews every row that reflects on a
function's properties. Fixed fixtures cover each bullet of the contract. A
property suite generates call graphs mixing strict and non-strict functions,
`call`, `apply`, `bind`, built-in callbacks, tail calls, recursion, and throws,
and compares each `caller` read with an independent activation model.

### `annexb-syntax`

Owns *test/annexB/language/comments/* (8), *test/annexB/language/literals/*
(8), *test/annexB/language/expressions/template-literal/* (2), and the
*test/annexB/built-ins/RegExp/* files and *named-groups/* rows that call no
`eval` (10), plus *test/built-ins/String/prototype/split/separator-regexp.js*
from ADR 0013.

HTML-like comments already parse; the unit pins their Script-only behavior,
including the multi-line comment and line-terminator cases. The main work is
the Annex B pattern grammar from the edition's Regular Expressions Patterns
section, in the compiler-side pattern parser and the runtime matcher descriptor
that [*PLAN-REGEXP.md*](./PLAN-REGEXP.md) owns. The grammar replaces the
OSEO1001 profile boundary that the M5 profile describes for literals and for
`String` operands. The generated invalid-pattern domain keeps the reported kind
as its oracle selector, now with an Annex B mode.

### `annexb-escape`

Owns *test/annexB/built-ins/escape/* (16) and *unescape/* (19). The two global
functions join the global object component. A property test generates strings
of arbitrary code units and checks that `unescape(escape(s))` returns `s` and
that every escape matches an independent encoder.

### `annexb-string-methods`

Owns `substr` (15), the thirteen HTML methods from `anchor` through `sup`
(82), and `trimLeft` and `trimRight` (8) under
*test/annexB/built-ins/String/prototype/*. The HTML methods share
CreateHTML, including the quotation mark escaping of attribute values.

### `annexb-date-methods`

Owns *test/annexB/built-ins/Date/prototype/* (24): `getYear`, `setYear`, and
`toGMTString`. `toGMTString` is the same function object as `toUTCString`.
The methods use the realm's UTC local time zone that the M5 profile records.

### `annexb-regexp-compile`

Owns *test/annexB/built-ins/RegExp/prototype/compile/* (21 after excluding the
2 `legacy-regexp` rows), *flags/order-after-compile.js*, and the two
*Symbol.split/* rows that recompile a source. `compile` reinitializes an
existing RegExp in place through the same validation as the constructor, so it
needs the `annexb-syntax` grammar. Its effect on `lastIndex`, on an object
whose `lastIndex` is non-writable, and on a subclass instance follows the
edition. A compiled artifact may be shared only while the source and flags it
was built from still match.

### `annexb-object-accessors`

Owns the 70 normative-optional paths ADR 0020 excluded: the five
*test/built-ins/Object/prototype/* directories for `__proto__`,
`__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, and
`__lookupSetter__`, and *test/built-ins/WeakRef/prototype/constructor.js*. It
also takes eight ADR 0013 rows: three TypedArray rows that read or write
`__proto__`, *test/language/types/object/S8.6.2\_A8.js*, and the four
*private-getter-is-not-a-own-property.js* and
*private-setter-is-not-a-own-property.js* rows.

The unit gives the existing `__proto__` accessor identities real bodies and
installs the four legacy methods. It removes the OSEO1001 accessor diagnostics
and the `[[Set]]` guard that reports the omitted setter. Every caller of those
walks, including `Reflect.set`, `super` assignment, proxies without a `set`
trap, and `Object.assign`, then reaches the ordinary setter. The fixtures in
*tests/annexb-proto-boundary.test.ts* become fixtures of the implemented
behavior. The existing property seeds `0x60008500`, `0x60008800`, and
`0x60008801` are re-registered for the new oracle or replaced with recorded
rationale.

### `annexb-function-declarations`

Owns *test/annexB/language/function-code/* (159),
*test/annexB/language/global-code/* (153), and
*test/annexB/language/statements/labeled/function-declaration.js*. This is
the largest Annex B unit and crosses the frontend, binding resolution, and the
global object.

It implements labelled function declarations, function declarations in `if`
clauses, and the block-level function web legacy semantics: the var-scoped
binding a non-strict block function gets when no conflict prevents it, the copy
at the declaration's evaluation, the skip rules for parameters, `arguments`, and
early-error conflicts, and the changes to global declaration instantiation.
Switch-clause duplicates in non-strict code follow the same rules. The
`predeclareBindings` early error in *packages/compiler/src/hir-build.ts* stays
for strict code and modules.

Seventeen global-code rows reach `$262.evalScript`, which
[ADR 0029](./docs/adr/0029-ahead-of-time-host-script-bindings.md) already
compiles ahead of time. The unit may land in two checkpoints, function code
first, because global declaration instantiation adds the global-object cases.
A property suite generates nested blocks, `if` clauses, labels, parameters, and
`var` and `let` conflicts, and compares the observable bindings with an
independent model of the Annex B rules under both specialization policies.

### `annexb-statement-forms`

Owns *test/annexB/language/statements/for-in/* (7),
*test/annexB/language/expressions/assignmenttargettype/* (7), and
*test/annexB/language/statements/try/* (5). It implements the non-strict
`for (var x = init in obj)` form, whose initializer runs once before
enumeration, and the run-time `ReferenceError` for a function call used as an
assignment target, which non-strict code throws after the call and before
the right operand. The catch rows already behave as specified and need only
admission.

### `annexb-dynamic-source-accounting`

Owns the 477 new rows that call `eval` or a `Function` constructor: the
*test/annexB/language/eval-code/* rows, the six
_test/annexB/built-ins/Function/createdynfn-\*.js_ rows, and
*RegExp-leading-escape-BMP.js* and *RegExp-trailing-escape-BMP.js*. It also
takes the two ADR 0013 rows *S7.8.5\_A1.4\_T2.js* and *S7.8.5\_A2.4\_T2.js*.

No implementation lands here. Each row receives a reviewed exclusion audit row
under ADR 0016. A row whose non-source subject is Annex B behavior names the
`annexb-syntax` or `annexb-function-declarations` evidence that covers it, which
is why this unit follows them. A row whose non-source subject no evidence
covers stays with remediation and blocks `language-exit-audit`.

### ECMAScript 2026 units

Each unit owns every inventory path whose only exclusion reason was its feature
flag. The selectors are the `edition-2026:<feature>` basis values in the
current *tests/test262/inventory.tsv*.

 -  `error-is-error` owns `Error.isError` (12). It reports `[[ErrorData]]`,
    so it answers `true` for every native error type, `AggregateError`, and
    `SuppressedError` once that exists, and `false` for a proxy of an error.
 -  `math-sum-precise` owns `Math.sumPrecise` (10). The result is the
    correctly rounded exact sum, with the edition's `-0`, infinity, and NaN
    rules and an iterator that is closed on a non-Number value. A property
    test compares it with an exact BigInt rational sum.
 -  `upsert` owns `getOrInsert` and `getOrInsertComputed` on `Map` and
    `WeakMap` (72). `getOrInsertComputed` runs its callback once and then
    stores the result even if the callback inserted the key. The `WeakMap`
    forms require CanBeHeldWeakly and use the existing ephemeron storage.
 -  `array-from-async` owns `Array.fromAsync` (95). It covers async iterables,
    sync iterables through the async-from-sync wrapper, array-likes with an
    `await` per element, the optional mapper, and constructor receivers. A
    property test generates sources and schedules and compares the settled
    array and the order of observable steps with a reference model.
 -  `uint8array-base64` owns `toBase64`, `toHex`, `fromBase64`, `fromHex`,
    `setFromBase64`, and `setFromHex` (68). The options cover both alphabets,
    `lastChunkHandling`, and `omitPadding`, over detached and resizable
    buffers. Round-trip and partial-decode properties use an independent
    codec. Two more rows also need immutable `ArrayBuffer` and stay excluded.
 -  `iterator-concat` owns `Iterator.concat` (32). It reads every item's
    `Symbol.iterator` method when called, opens each item only when its turn
    comes, and forwards `return` to the active inner iterator.
 -  `json-parse-source` owns `JSON.rawJSON`, `JSON.isRawJSON`, and the
    reviver context argument (21). It changes the `json-parse` and
    `json-stringify` components: the reviver receives the source text of each
    primitive value, and `JSON.stringify` emits a raw JSON object's text
    unchanged.

### ECMAScript 2027 units

 -  `disposal-intrinsics` owns the 240 *test/built-ins/* rows of explicit
    resource management: `SuppressedError`, `DisposableStack`,
    `AsyncDisposableStack`, `Symbol.dispose`, `Symbol.asyncDispose`, and the
    dispose methods of `%Iterator.prototype%` and `%AsyncIteratorPrototype%`.
    Adding two well-known symbols changes the well-known symbol table that M5b
    fixed at thirteen entries.
 -  `using-declarations` owns the 184 *test/language/statements/* rows for
    `using` and `await using`, including `for`, `for-of`, `for-await-of`,
    and `switch` heads and module top level. It lowers each declaration
    through the cleanup contract above. The pinned `@babel/parser` 8.0.4
    already parses the syntax; the converter currently rejects it with
    OSEO1001. A property suite generates nested scopes, transfers, throwing
    and async disposers, and checks disposal order and the `SuppressedError`
    chain against a model.
 -  `iterator-zip` owns `Iterator.zip` and `Iterator.zipKeyed` (82), with the
    `shortest`, `longest`, and `strict` modes and padding. Neither reference
    host implements them, so a model written from the specification replaces
    differential evidence.
 -  `atomics-pause` owns `Atomics.pause` (5). It validates the optional
    iteration count and returns `undefined`. Whether it emits a processor
    pause hint is a target choice recorded in the target description.

### `language-exit-audit`

This unit runs after every other unit. It confirms that the expanded inventory
meets ADR 0032's closure condition, publishes a coverage report like the M5
exit report, and updates *ROADMAP.md*, the profile, and this plan's status.


Evidence each unit supplies
---------------------------

Every unit follows *CONTRIBUTING.md*. It needs fixed native fixtures registered
in *tests/native.ts*, including both forced-collection lists, and a family
record that assesses the profile's fixed evidence vocabulary. Each covered
class names existing evidence; each omitted class gives a reason and names the
replacement.

Differential tests compare native output with Node.js and Deno where both
expose the feature. Where only Deno does, Deno is the single reference and the
record says so. Where neither does, an independent model replaces it. A unit
with a useful generated domain adds a *.property.test.ts* family with its own
seed block. Every specialized path needs a deliberate guard miss that reaches
the compiled generic fallback, and every new heap kind or traced field runs
under collection at every safepoint.

Units that change compiler lowering, the runtime, or generators also pass
`mise run test:property:extended`. Native rows run on Linux AMD64 and macOS
AArch64, and AArch64 Linux keeps its cross-link.

A unit is done when every path it owns is a pass, an expected negative, or an
unsupported row with an accepted owner. It must also have reviewed every other
changed record, kept its family record complete, and passed `mise run check`
and `mise run test` on the commit that lands.


Serialization points
--------------------

Parallel worktrees conflict on a small set of shared files and numbers. A
coordinator reserves numbers when a unit starts and the unit uses only its own
reservation. A unit that rebases over another landing reruns its full
standards update and heavy gates on the new base.

 -  The inventory policy and *tests/test262/inventory.tsv* change only in
    `claim-boundary`.
 -  Every unit that changes *packages/* or *tools/* runs the full
    `mise run test262:update`. Its manifest partitions, the reviewed subset,
    and `supportedFeatures` conflict with every other landing, so landings
    are queued.
 -  The closure ledger, the exclusion audit, and *deferrals.yaml* change when a
    row's owner moves. The audit binds ADR texts by digest, so a unit that
    edits ADR 0013, 0016, or 0028 re-reviews the rows that cite it.
 -  The runtime ABI version in *packages/runtime-c/src/index.ts*, currently
    `m5-147`, changes once per landing that alters the ABI.
 -  Runtime code ranges, property blocks, intrinsic indexes, and heap kinds
    are reserved per unit.
 -  The well-known symbol table changes only in `disposal-intrinsics`.
 -  Each new property file reserves an aligned 256-seed block in
    *tests/property-seeds.yaml*.
 -  A new test file that runs for minutes adds its weights to
    *tools/native-shard-costs.ts* and *tools/node-shard-costs.ts* in the same
    change.
 -  A new dependency tag enters *packages/testkit/src/index.ts* together with
    the vocabulary amendment that ADR 0013 requires.
 -  OSEO1001 message texts that the exclusion audit quotes change only with an
    audit update.


Exit criteria
-------------

The plan is complete when:

 -  ADR 0032, the ADR 0016 amendment, and the successor to ADR 0028 are
    accepted;
 -  the inventory contains 43,007 included paths at the pinned revision, or
    the accepted ADR 0032 explains a different count;
 -  every unit's owned paths are passes, expected negatives, or ADR 0016
    results with reviewed audit rows, and no remediation owner remains;
 -  the 17 closable `static-specifier-import` rows and the 18 non-dynamic
    `caller` rows pass, and the remaining deferrals still name *PLAN-DYN.md*;
 -  no previously passing row regresses, and the compatibility ratchet
    accepts the result;
 -  every new family has a complete record and every Annex B behavior in the
    table above has fixed, differential, and standards evidence; and
 -  `mise run check`, `mise run test`, and `mise run test:property:extended`
    pass from a clean checkout.


Open questions
--------------

 -  Should `legacy-caller` also add V8's own `arguments` property on
    non-strict functions? The maintainer approved only `caller`, but V8
    installs both, and own-key observations will differ from the reference
    hosts if Oseo adds one without the other.
 -  Should the new families extend the M5 profile and its index, or start a
    successor profile document? `claim-boundary` needs the answer.
 -  Should the closure tools keep their `m5c` names after they cover the
    expanded inventory?
 -  Should a later change re-pin test262 before `language-exit-audit`, so the
    claim covers tests added upstream for these features since July 2026?
    ADR 0032 keeps the pin; a re-pin re-reviews every affected row.
 -  The runtime ABI string still carries the `m5` prefix. Should post-M5
    landings start a new series?
