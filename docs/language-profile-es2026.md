ECMAScript 2026 language profile
================================

Status
------

Implementation status: started. This profile succeeds the
[M5 language profile](./language-profile-m5.md) for the claim that
[ADR 0032](./adr/0032-post-m5-edition-boundary.md) defines.
[*PLAN-LANGUAGE.md*](../PLAN-LANGUAGE.md) schedules the work. The M5 profile
stays fixed as the record of the M5 claim and its 41,091-path inventory, and
the [M5 exit report](./m5c-closure/m5-exit-report.md) keeps the M5 result.

A change that admits or measures behavior inside this boundary updates this
document in the same change. A family's status describes tested current
behavior, never intended behavior. The Annex B built-in units, the Annex B
Object accessors, the Annex B language units, the Annex B syntax and
`RegExp.prototype.compile` units, the small ECMAScript 2026 built-in units,
`iterator-zip`, `array-from-async`, `json-parse-source`, the two explicit
resource management units, and the static-specifier `import()` admission hold
the family records so far; see
[Annex B built-ins](#annex-b-built-ins),
[Annex B Object accessors](#annex-b-object-accessors),
[Annex B language semantics](#annex-b-language-semantics),
[Annex B syntax and `compile`](#annex-b-syntax-and-compile),
[Small ECMAScript 2026 built-in families](#small-ecmascript-2026-built-in-families),
[Joint iteration](#joint-iteration), [`Array.fromAsync`](#arrayfromasync),
[JSON source text](#json-source-text), and
[Explicit resource management](#explicit-resource-management).


Claim boundary
--------------

The claim is the ECMA-262 17th edition, ECMAScript 2026, plus three features
finished for ECMAScript 2027: explicit resource management, joint iteration,
and `Atomics.pause`. Annex B is inside the claim except `[[IsHTMLDDA]]`, and so
are the main-body clauses the edition marks normative optional:
`Object.prototype.__proto__`, the four legacy accessor methods, and
`WeakRef.prototype.constructor`. Oseo keeps the default behavior of the host
hooks that Annex B lets a web browser replace.

Temporal, ECMA-402, and proposal-stage features stay outside, owned by
[*PLAN-TEMPORAL.md*](../PLAN-TEMPORAL.md), [*PLAN-INTL.md*](../PLAN-INTL.md),
and the proposal rule of the inventory. `eval`, the `Function` constructor
family, and dynamic import stay inside the claim.
[ADR 0016](./adr/0016-dynamic-source-boundary.md) admits only `import()` with
one string literal argument, resolved during the build, and keeps every other
form outside the profile. Realms, agents, shared memory, and host hooks keep
the treatment of [ADR 0013](./adr/0013-m5-edition-and-manifest.md).

*tests/test262/inventory-policy.yaml* records the pinned sources. The edition
is the `es2026` tag of tc39/ecma262 at commit
`0248456c758431e4bb8e5d26333ff1865123c9cd`. The three later features are the
ecma262 draft at commit `f792966f2bcf78ed079df6697ad1ba9070086955`, the first
that contains all three; the `es2026` tag contains none of them. The test262
revision stays `f2d1435644797268dca1f7988cad5a4e89ccd8d2`, and the TC39
finished-proposals revision stays `1eb7ced36bcb794e75af0b0a24c8199fba6bc6f3`.


Measurement
-----------

*tests/test262/inventory.tsv* classifies the 48,467 candidate files under
*test/annexB/*, *test/built-ins/*, and *test/language/* by the rule of ADR
0032. It includes 43,007 paths and excludes 5,460: 4,611 Temporal paths, 788
paths whose only reasons are proposals, 35 `IsHTMLDDA` paths, and 26
`legacy-regexp` paths. `mise run check:test262-inventory` regenerates both
inventories from the pinned corpus and compares them with the checked-in text.

The rule adds 1,916 included paths to the M5 inventory:

| Source                                            | Paths |
| ------------------------------------------------- | ----: |
| Seven ECMAScript 2026 features                    |   310 |
| Three ECMAScript 2027 features                    |   511 |
| Normative-optional paths under *test/built-ins/*  |    70 |
| *test/annexB/* without IsHTMLDDA or legacy-regexp | 1,025 |
| Total                                             | 1,916 |

*tests/test262/inventory-m5-additions.txt* lists them. The inventory tool
derives it by classifying every candidate also under the frozen ADR 0020 rule
in *tests/test262/inventory-policy-m5.yaml*, and it rejects a change that
would drop an M5 path from the inventory.

An added path enters the reviewed subset and the manifest only when its unit
admits it. Until then it is `unreviewed` in the
[closure ledger](./m5c-closure/README.md) with the `unit:<id>` owner of the
*PLAN-LANGUAGE.md* unit that implements it. A unit admits its rows into
*tests/test262/subset.yaml* with reviewed dependency tags when its behavior
lands, and the full manifest update observes them.

`mise run check:language-claim-audit` applies the closure conditions of
[ADR 0019](./adr/0019-m5-claim-closure.md) to the expanded inventory. It
requires zero semantic, harness, and infrastructure failures and an owner for
every unsupported path, and it counts the open unreviewed and remediation
paths of each unit. It rejects a path that still has the ADR 0013 owner,
because ADR 0032 withdrew that record's Annex B authorization. The 11 former
ADR 0013 rows became remediation of their units; the eight that
`annexb-object-accessors` took now pass, and the other three still count as
remediation. `language-exit-audit` runs
it with `--require-closed`, which also requires both counts to be zero.
`mise run report:language-coverage` prints the counts. The M5 denominator and
this one stay separate: a percentage of this claim uses the 43,007 included
paths.


Normative family records
------------------------

The complete language profile is the union of the frozen
[M3](./language-profile-m3.md) and [M4](./language-profile-m4.md) profiles,
every indexed M5 family record, and every family record indexed here. The
earlier profiles remain the normative owners of their admitted behavior.

The files under *language-profile-es2026/index/* are this profile's normative
index. Each names one record under *language-profile-es2026/families/* with
the same stable kebab-case ID and filename. Records use the version 1 template
and the evidence-class vocabulary of the
[M5 normative family records](./language-profile-m5.md#normative-family-records).

`mise run check:evidence-lanes` validates the M5 and ECMAScript 2026 record
sets and rejects a family ID that both profiles record. The compatibility
ratchet snapshots the IDs of both, so removing a family is a monotonicity
violation without an override path.


Family index
------------

Each unit adds the index and record files of its families in the change that
admits its rows. Until then a family has no record and its paths stay
unreviewed.

| Unit                               | Behavior                                                     | New paths |
| ---------------------------------- | ------------------------------------------------------------ | --------: |
| `import-admission`                 | Static-specifier `import()`                                  |         0 |
| `annexb-syntax`                    | HTML-like comments, legacy literals, Annex B pattern grammar |        28 |
| `annexb-escape`                    | `escape` and `unescape`                                      |        35 |
| `annexb-string-methods`            | `substr`, HTML methods, `trimLeft`, `trimRight`              |       105 |
| `annexb-date-methods`              | `getYear`, `setYear`, `toGMTString`                          |        24 |
| `annexb-regexp-compile`            | `RegExp.prototype.compile`                                   |        24 |
| `annexb-object-accessors`          | `__proto__` accessor, legacy accessor methods                |        70 |
| `annexb-function-declarations`     | Annex B function declaration semantics                       |       313 |
| `annexb-statement-forms`           | `for-in` initializers, call assignment targets, `catch`      |        19 |
| `annexb-dynamic-source-accounting` | ADR 0016 accounting of Annex B dynamic-source rows           |       477 |
| `error-is-error`                   | `Error.isError`                                              |        12 |
| `math-sum-precise`                 | `Math.sumPrecise`                                            |        10 |
| `upsert`                           | `getOrInsert` and `getOrInsertComputed`                      |        72 |
| `array-from-async`                 | `Array.fromAsync`                                            |        95 |
| `uint8array-base64`                | `Uint8Array` base64 and hex                                  |        68 |
| `iterator-concat`                  | `Iterator.concat`                                            |        32 |
| `json-parse-source`                | `JSON.rawJSON`, `JSON.isRawJSON`, reviver source text        |        21 |
| `disposal-intrinsics`              | Disposal intrinsics and well-known symbols                   |       240 |
| `using-declarations`               | `using` and `await using`                                    |       184 |
| `iterator-zip`                     | `Iterator.zip` and `Iterator.zipKeyed`                       |        82 |
| `atomics-pause`                    | `Atomics.pause`                                              |         5 |
| Total                              |                                                              |     1,916 |

The ledger owner of each row is `unit:` followed by the unit name in the first
column. `annexb-dynamic-source-accounting` adds no family: its rows are
ADR 0016 exclusions with
[reviewed exclusion audit rows](./m5c-closure/exclusion-audit.md#annex-b-dynamic-source-rows).


Annex B built-ins
-----------------

The Annex B B.2 built-ins enter the claim through
[ADR 0032](./adr/0032-post-m5-edition-boundary.md). They exist in every realm,
including realms that `$262.createRealm` creates. Their family records are
`annexb-escape`, `annexb-string-methods`, and `annexb-date-methods`. All 164
owned test262 paths pass, and each record's standards class cites the results
partitions that hold its rows.

### `escape` and `unescape`

The `annexb-escape` unit installs `escape` and `unescape` of B.2.1 as global
functions. Each is an ordinary built-in function with its specified name, a
`length` of 1, `%Function.prototype%` as its `[[Prototype]]`, and no
`prototype` property, and neither is a constructor. The global object binds
both as writable, non-enumerable, configurable properties, and the compiler
resolves them as property-owned replaceable intrinsics, the way it resolves
the URI handling functions.

Both functions convert their argument with `ToString` first. `escape` leaves
the ASCII letters, digits, and `@*_+-./` unchanged, writes every other code
unit below 256 as `%XX`, and writes every other code unit as `%uXXXX`, both
with uppercase hexadecimal digits. It works on code units, so a lone
surrogate is escaped rather than rejected. `unescape` replaces a `%uXXXX`
form, tried first, or a `%XX` form, with the code unit its digits name in
either letter case. A `%` that starts neither form stays in the result, so
`unescape` never throws after its conversion.

Both functions live in *runtime\_uri.c* beside the URI handling functions and
share its code-ID range and host-memory string builder. The realm gains the
intrinsic slots `OSEO_INTRINSIC_ESCAPE` and `OSEO_INTRINSIC_UNESCAPE`, and the
runtime ABI moves to `m5-150`.

The fixed fixture *tests/native/fixtures/annexb-escape.ts* is compared with
Node.js and Deno under both specialization policies and forced collection. It
covers metadata, every ASCII unit outside the unescaped set, the Latin-1 and
`%u` boundaries, surrogates, each malformed `unescape` form, coercion and
abrupt conversion, a global-object shape guard miss, and global replacement
and deletion. *tests/property/m5-annexb-escape.property.test.ts*, seed block
`0x60009d00`, generates arbitrary code-unit operands and `%XX` and `%uXXXX`
forms with valid and invalid digits. It checks `escape` against an encoder
computed from each unit's bits, `unescape` against an independent decoder, and
the `unescape(escape(s))` round trip. The 35 test262 paths are those under
*test/annexB/built-ins/escape/* and *unescape/*.

### `String.prototype` methods

The `annexb-string-methods` unit installs `substr` of B.2.2.1 and the thirteen
HTML methods of B.2.2.2 through B.2.2.14 on `%String.prototype%` as ordinary
built-in methods, writable, non-enumerable, and configurable, none of them a
constructor. `substr` has a `length` of 2; `anchor`, `fontcolor`, `fontsize`,
and `link` have 1; the other nine have 0. `trimLeft` and `trimRight` are
further properties whose values are the `trimStart` and `trimEnd` function
objects, so their `name` stays `trimStart` and `trimEnd`.

Every method throws a `TypeError` for an `undefined` or `null` receiver and
converts any other receiver with `ToString`. `substr` then converts its start
and, when present, its length with `ToIntegerOrInfinity`. A negative start
counts from the end and is clamped at 0, the length is clamped to what
remains, and an absent or `undefined` length takes the rest.

The HTML methods share CreateHTML. It writes `<tag`, then for the four methods
with an attribute (`name`, `color`, `size`, `href`) a space, the attribute
name, and the attribute value in quotation marks, then `>`, the receiver
string, and `</tag>`. The attribute value is converted with `ToString` after
the receiver, and each quotation mark in it becomes `&quot;`; no other
character is escaped. The tags are `a`, `big`, `blink`, `b`, `tt`, `font`,
`i`, `small`, `strike`, `sub`, and `sup`.

The methods live in *runtime\_string.c* and take fourteen code IDs in the String
range, under the same runtime ABI `m5-150` as `escape`. The fixed fixture
*tests/native/fixtures/annexb-string-methods.ts* is compared with Node.js and
Deno under both specialization policies and forced collection. It covers
metadata and the alias identities, trimming of eight whitespace and line
terminator units and the U+180E exclusion, `substr` over integer, fractional,
NaN, infinite, signed-zero and string operands, each HTML method with escaped
and coerced attribute values, primitive and object receivers, conversion order,
nullish and Symbol operands, abrupt conversion, replacement of a method, and a
property-read guard miss.
*tests/property/m5-annexb-string-methods.property.test.ts*, seed block
`0x60009e00`, generates receivers and attribute values with quotation marks,
markup characters, whitespace, and surrogates and checks `substr`, CreateHTML,
and both trim aliases against independent models. The 105 test262 paths are
those of these methods under *test/annexB/built-ins/String/prototype/*.

### `Date.prototype` methods

The `annexb-date-methods` unit installs `getYear` and `setYear` of B.2.3.1 and
B.2.3.2 on `%Date.prototype%` as ordinary built-in methods, writable,
non-enumerable, and configurable, with `length` 0 and 1. `toGMTString` is a
further property whose value is the `toUTCString` function object, so its
`name` stays `toUTCString`. All three throw a `TypeError` for a receiver
without `[[DateValue]]`, before any argument conversion.

`getYear` returns `YearFromTime(LocalTime(t))` minus 1900, or NaN for an
invalid date. `setYear` reads the receiver's time value, then converts its
argument with `ToNumber`. An invalid date starts from +0. `MakeFullYear` maps
an integer part from 0 through 99 to 1900 through 1999 and keeps every other
year, and the month, date, and time within the day come from the time value
read first. A NaN year stores and returns NaN, and a result outside the
time-value range clips to NaN. The local time zone is the realm's UTC zone, so
`LocalTime` and `UTC` add nothing.

B.2.3.2 uses the time value read before `ToNumber(year)`, so a conversion that
stores a new time value into the same Date does not change the result. The
test262 files `date-value-read-before-tonumber-when-date-is-valid.js` and
`date-value-read-before-tonumber-when-date-is-invalid.js` under
*test/annexB/built-ins/Date/prototype/setYear/* pin that order. Node.js 24.21.0
and Deno 2.9.7 both reread the slot after the conversion, so this case has a
written expectation and a native-only observation, as the other Date setters
do.

The methods live in *runtime\_date.c*: `getYear` and `setYear` are entries 44
and 45 of its method table, after `[Symbol.toPrimitive]`, and take two more
Date-range code IDs under the same runtime ABI `m5-150`. The fixed fixture
*tests/native/fixtures/annexb-date-methods.ts* is compared with Node.js and
Deno, running in UTC, under both specialization policies and forced
collection. It covers metadata and the alias identity, `getYear` across 1900,
2000, both ends of the time-value range and NaN, `setYear` over the 0 to 99
window, its edges, fractions, negative and out-of-range years, a leap day, an
invalid start, NaN and infinite years, coerced operands, eight non-Date
receivers for all three methods, receiver-before-conversion order, abrupt,
Symbol and BigInt conversion, and a property-read guard miss.
*tests/property/m5-annexb-date-methods.property.test.ts*, seed block
`0x60009f00`, generates receiver time values and year operands and checks
`getYear`, `setYear`, and `toGMTString` against an independent proleptic
Gregorian calendar model. Its second test observes the read-before-conversion
case natively. The 24 test262 paths are those under
*test/annexB/built-ins/Date/prototype/*.


Annex B Object accessors
------------------------

The `annexb-object-accessors` family record covers the normative-optional
accessor and methods of ECMA-262 20.1.3.8 through 20.1.3.12, which
[ADR 0020](./adr/0020-m5-applicable-test-inventory.md) excluded
from the M5 claim. They exist in every realm. `%Object.prototype%` creates them
after its seven core properties, in clause order: `__proto__`,
`__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, and
`__lookupSetter__`. The accessor is non-enumerable and configurable, with
functions named `get __proto__` and `set __proto__`; the methods are writable,
non-enumerable, and configurable, with lengths 2, 2, 1, and 1. None of the six
functions is a constructor or has a `prototype` property.

The getter returns `[[GetPrototypeOf]]` of `ToObject(this)`, so a primitive
reads its wrapper prototype. The setter throws a `TypeError` for a nullish
receiver, returns without effect for a primitive receiver or a value that is
neither an object nor `null`, and throws a `TypeError` when `[[SetPrototypeOf]]`
refuses: a cycle, a non-extensible object, the immutable `%Object.prototype%`,
or a Proxy trap that returns false. The accessor is an ordinary property, so
every `[[Get]]` and `[[Set]]` caller reaches it: member access, `Reflect.get`
and `Reflect.set` with a receiver, `super` property reads and assignment, a
Proxy without the matching trap, and `Object.assign`. An own or inherited
property named `__proto__` shadows it, deleting it removes it, and descriptor
round trips, integrity levels, and for-in treat it like any other accessor. The
object-literal `__proto__: value` form, computed and shorthand keys, object
spread, and `JSON.parse` keep their own semantics.

`__defineGetter__` and `__defineSetter__` take `ToObject(this)`, throw a
`TypeError` for a non-callable function before converting the key, and then
call DefinePropertyOrThrow with an enumerable, configurable accessor half, so
an existing other half survives and a Proxy sees its `defineProperty` trap.
`__lookupGetter__` and `__lookupSetter__` walk `[[GetOwnProperty]]` and
`[[GetPrototypeOf]]` from `ToObject(this)`, so Proxy traps run in that order,
and the first own property found answers: its half for an accessor, `undefined`
for a data property.

Node.js 24.21.0 is the only reference for the accessor. Deno 2.9.7 replaces it
with a shim that warns and never changes a prototype, and reports JavaScript
functions named `__proto__`; *tests/helpers/annexb-identity.ts* keeps that
metadata separate. Both hosts are references for the four methods. The fixed
fixtures *tests/native/fixtures/annexb-object-accessors.ts*, run by
*tests/annexb-object-accessors-native.test.ts*, cover the accessor's receivers,
values, refusals, callers, literal forms, typed arrays, enumeration, and
forwarding; its redefinition, deletion, freezing, and cross-realm halves; and
the methods' metadata, conversion order, refusals, keys, chains, primitives,
and Proxy traps. *tests/annexb-proto-boundary.test.ts* and
*tests/annexb-legacy-lookup-boundary.test.ts* compare the accessor's and
methods' read, write, forwarding, integrity, and realm cases with the
references. All run under both specialization policies with collection forced
at every safepoint, and the fixtures warm a property read so the enabled policy
reaches the generic fallback through a guard miss.

*tests/property/m5-annexb-object-accessors.property.test.ts*, seed block
`0x6000a400`, generates sequences of `__proto__` writes, strict writes,
`Reflect.set` calls, setter calls, and reads over ordinary, null-prototype,
non-extensible, Proxy, and `%Object.prototype%` targets, and sequences of legacy
definitions and lookups over ordinary, inheriting, non-extensible,
non-configurable, and Proxy targets. An independent model of the clauses
checks each, together with the references. The earlier suites at
`0x60008500`, `0x60008800`, and `0x60008801` keep their domains and budgets with
oracles of the implemented behavior: own keys that shadow the accessor beside
intrinsic reads and writes, lookup chains that may end at the real method, and
chains over the intrinsic that find accessor halves the program defines.

The 70 owned test262 paths are those under the five
*test/built-ins/Object/prototype/* directories named for the accessor and the
methods, and *test/built-ins/WeakRef/prototype/constructor.js*. The family also
takes eight ADR 0013 rows: three TypedArray rows that read or write
`__proto__`, *test/language/types/object/S8.6.2\_A8.js*, and the four
*private-getter-is-not-a-own-property.js* and
*private-setter-is-not-a-own-property.js* rows. All 78 rows pass and close by
observation, and the family record's standards class cites the 70 results
partitions that hold them. The two TypedArray rows include
*resizableArrayBufferUtils.js*. They pass because the reviewed harness copy in
*tests/test262/harness/* writes its three subclasses as class expressions
instead of compiling them through the `Function` constructor.


Annex B language semantics
--------------------------

The `annexb-function-declarations` and `annexb-statement-forms` units implement
the Annex B rules that change non-strict code: B.3.1 through B.3.5 for
function declarations and the `for-in` initializer, and the run-time error for
a call used as an assignment target. Strict code and modules keep every early
error they reported before. Their family records are
`annexb-function-declarations` and `annexb-statement-forms`. Of their 332
test262 rows, 326 pass and six report the parse-time `SyntaxError` they expect;
each record's standards class cites the results partitions that hold its rows.

### Function declarations

The frontend rewrites the two Annex B declaration positions into forms the
rest of the compiler already handles. `if (x) function f() {}` becomes a Block
holding the declaration, as B.3.3 specifies. A labelled function declaration
becomes the declaration itself, which is safe because no `break` or
`continue` can name a label across a function boundary. A labelled
declaration at a function body's or Script's top level is therefore an ordinary
var-scoped function. One inside a Block stays lexical and gets no var-scoped
copy, since B.3.2 applies only to a declaration directly in a Block or clause
statement list. Babel reports every strict form and every labelled function
in a statement position.

B.3.2 gives a qualifying block-level function a var-scoped binding of the same
name, initialized to `undefined` at the start of the function or Script, and
copies the Block's binding into it when the declaration is evaluated. A
declaration qualifies when it is an ordinary function declaration, the code
is non-strict, its name is not a parameter or the `arguments` of a function
that needs its arguments object, and a `var` of its name at that position
would raise no early error. The frontend checks that last condition against
the same lexical frames `var` hoisting checks: enclosing Blocks and CaseBlocks
with their function declarations, `for` heads with `let` or `const`, the
function body's or Script's top-level lexical declarations, and destructured
catch parameters. A simple catch parameter does not block it, as B.3.4
requires. The declaration's own statement list counts too, minus the
declaration itself, so two same-name functions in one Block both stay
block-scoped. The copy is a new statement that follows the declaration. HIR
writes the var-scoped binding found in the function body's scope, the
parameter environment's body Block, or the Script scope directly, past any
catch parameter or `with` object in between.

B.3.2.4 and B.3.2.5 also admit duplicate function names in one Block or
CaseBlock of non-strict code when every declaration is an ordinary function
declaration; the last one initializes the binding. A block-level function named
`arguments` inside an arrow function that has no `arguments` binding of its
own reports OSEO1001. The edition creates that binding only when the copy runs,
and the ahead-of-time compiler has no form for a binding that appears during
execution.

In Script code, B.3.2.2 adds the qualifying names that no top-level `var` or
function declares to the global-object entries of
GlobalDeclarationInstantiation, ahead of the function and `var` entries.
`oseo_global_object_create` takes a new `web_legacy_functions` table that marks
them. Such an entry never throws: the runtime skips it when an earlier Script's
lexical declaration holds the name, or when the global object is not extensible
and lacks the property, and otherwise binds it the way it binds a `var`. A
skipped entry's cell stays detached from the global object. Host Script
references resolve the name through the realm, so the copy written to that cell
is never observed. The runtime ABI moves to `m5-156` for the new parameter.

V8 departs from the edition in five places these units follow the edition
for. It hoists both of two same-name functions in one Block, hoists a
labelled function inside a Block, lets an inner Block's function replace an
outer Block's function of the same name, overwrites the arguments object with
a block-level function named `arguments`, and reports a SyntaxError for a
host Script whose block-level function shares a name with an earlier Script's
`let`. In a `vm` context it also makes the global property configurable when
the copy runs, and enumerable for an intrinsic such as `parseInt`. test262
checks the nested-Block, `arguments`, and attribute cases.

### Statement forms

B.3.5 admits one initializer in a non-strict `for (var x = init in obj)` head
whose binding is a plain identifier. The frontend emits the initializer as an
assignment to the hoisted `var` binding ahead of the loop, so it runs once,
before the subject is evaluated, and names an anonymous function or class
after the binding. A label on the statement moves onto the loop, so
`continue label` still reaches it.

A function call used as the target of `=`, a compound assignment, `++`, `--`,
or a `for-in` or `for-of` head in non-strict code throws a ReferenceError at
run time instead of failing to parse. Babel still rejects the strict forms
and the logical assignment and destructuring forms. The new
`invalid-assignment-target` expression evaluates the call, then throws a
ReferenceError built from the realm's own constructor, so the right operand,
the old value's conversion, and the store never run. A loop head instead binds
each value to a fresh synthetic binding and makes the call and the throw the
first statement of the body. The order is the one ForIn/OfBodyEvaluation
gives, and the abrupt body closes a `for-of` iterator. The five
*test/annexB/language/statements/try/* rows already passed and need only
admission.

### Evidence

*tests/annexb-function-declarations-native.test.ts* runs the fixtures in
*tests/native/fixtures/annexb-functions.ts* under both
specialization policies, with collection at every safepoint and a
property-read guard miss into the generic path. Eight fixtures are compared
with Node.js and Deno running them as Scripts. They cover the copy in function
code, every `if` and `switch` clause form, each skip rule, labelled
declarations, global properties and existing global names, host Scripts, the
`for-in` initializer, and every call target form, including the evaluation
order and the iterator close. The ninth holds the V8 departures above and is
compared with output written from the edition.

*tests/property/annexb-function-declarations.property.test.ts*, seed block
`0x6000a200`, generates function and Script code that places a declaration
in a Block, an `if` clause, or a `switch` clause under up to three Blocks,
`try`, catch clauses, `for` heads, labels, lexical Blocks, and `with`
statements, with parameters, top-level `var`, `let`, and function
declarations, and strict bodies. It compares the native values of the name
before and after the declaration, and the global property, with an independent
model of the skip rules, and with V8 running the program as a Script; the
generator avoids the V8 departures. The statement forms have no generated
domain beyond their fixed shapes, so their record omits the generated class.
*packages/parser-babel/tests/annexb-functions.test.ts* checks which
declarations receive a copy and which forms stay early errors.


Annex B syntax and `compile`
----------------------------

The `annexb-syntax` and `annexb-regexp-compile` units add the Annex B
language syntax that has no family elsewhere and the one Annex B
`RegExp.prototype` method. Their family records are `annexb-syntax` and
`annexb-regexp-compile`. In the full test262 observation, 19 of the 28 new
`annexb-syntax` rows pass, the other nine report the `SyntaxError` they
expect, and all 24 `annexb-regexp-compile` rows pass. Each record's standards
class cites the results partitions that hold its rows. The two
*RegExp-leading-escape-BMP.js* and *RegExp-trailing-escape-BMP.js* rows call
`eval` and are observed as unsupported. They are ADR 0016 exclusions, because
the exhaustive literal property observes every escaped literal they build.

### HTML-like comments

The parser already accepted the B.1.1 comments in Script code and rejected
them in Module code, and both goals keep that behavior. `<!--` starts a
single-line comment anywhere. `-->` starts one at the start of the source,
after a line terminator with only white space and comments before it on its
line, and after a multi-line comment that contains a line terminator,
U+2028 and U+2029 included. Anywhere else `-->` is a decrement followed by a
greater-than comparison. A Module that uses either form reports `OSEO0001`.

### Regular expression patterns

A pattern without `u` or `v` follows the grammar of B.1.2 in both places that
compile patterns: the build-time parser in *regexp-parse.ts*, whose artifact
the C backend writes as matcher data for a literal, and the runtime's own
validator and program compiler in *runtime\_regexp.c* and
*runtime\_regexp\_matcher.c*, which serve the `RegExp` constructor, the
String methods that create a RegExp, and `compile`. Under `u` and `v` nothing
changes, so every Annex B form there is still the edition's early error.

| Text                                  | Reading without `u` or `v`                                      |
| ------------------------------------- | --------------------------------------------------------------- |
| `\a`, `\_`, `\p`, `\é`                | Identity escape; every character but `c` qualifies              |
| `\k` when no group name is declared   | Identity escape of `k`, so `\k<x>` matches `k<x>`               |
| `\01`, `\477`, `\08`                  | Legacy octal escape, at most `\377`, and the digits it leaves   |
| `\N` above the capture count          | Legacy octal escape, or an identity escape of `8` or `9`        |
| `\x`, `\x4`, `\u`, `\u12`, `\u{2}`    | Identity escape of `x` or `u`; `\u{2}` repeats `u` twice        |
| `\c` without an ASCII letter          | A backslash, with `c` the next atom                             |
| `[\c1]`, `[\c_]`                      | A control escape of a digit or `_` inside a class               |
| `]`, `}`, and `{` that starts nothing | A pattern character; `{1}` with nothing to repeat stays invalid |
| `[\d-a]`, `[a-\w]`                    | The union of both ends and `-`                                  |
| `(?=a)*`, `(?!b){2}`                  | A quantified lookahead                                          |

A decimal escape is a backreference only when its value is at most the number
of left-capturing parentheses in the whole pattern, which both parsers count
before parsing. The build-time parser represents a quantified lookahead as a
quantified non-capturing group around it, which is the matcher the edition
gives that production, so neither matcher needed a new repetition form. An
identity escape no longer asks whether its character continues an
identifier, so a dynamic pattern such as `new RegExp("\\é")` compiles rather
than reporting the `OSEO2001` boundary it reported for want of Unicode data.
The text Annex B shares as an error stays one: a quantified lookbehind, edge
assertion, or word boundary, an out-of-order range, a quantifier with nothing
to repeat or with reversed bounds, and `\k` that names no group in a pattern
that declares one.

`parseRegExpPattern` takes `annexB: false` to parse the core grammar alone.
Without `u` or `v` that mode reports every construct only Annex B admits as an
`unsupported` error naming Annex B, which is what lets the generated invalid
domain at seed `0x60004a01` keep its reported kind as the oracle selector: an
`invalid` rejection must agree with Annex B's parse and with the host, and an
`unsupported` one must be accepted by both. The runtime validator also stopped
treating a `-` after a completed range as the start of another range, so
`[a-c-b]` is valid in every mode, as it is in the edition.

The fixed fixtures in *tests/native/fixtures/annexb-syntax.ts* run each
reading above as a literal and through the constructor and String methods,
pin the early errors, and include the four Annex B patterns of
*test/built-ins/String/prototype/split/separator-regexp.js*, the ADR 0013 row
this unit remediates; that row now passes. Its exclusion audit row stays as
the record of the remediation. The fixtures run as
Scripts in both strictness modes under both specialization policies and
forced collection against Node.js and Deno, and the dynamic fixture's reader
misses its shape guard.
*tests/property/m5-annexb-regexp-syntax.property.test.ts*, seed block
`0x6000a000`, generates token sequences of Annex B and core text. Seed
`0x6000a000` compares the build-time parser's acceptance and matcher results
with the host's under every flag set, and seed `0x6000a001` runs batches of the
same patterns natively as literals and through the runtime compiler. The
exhaustive literal suite now accepts all 65,521 selected code units of each
escaped domain and checks the core grammar's 50,784 rejections separately.

### `RegExp.prototype.compile`

`compile` of B.2.4.1 is a writable, non-enumerable, configurable method with
`length` 2 and no `prototype`, installed after `toString` in every realm. It
throws a `TypeError` for a receiver without `[[RegExpMatcher]]`, and for a
RegExp pattern with flags other than `undefined`. A RegExp pattern supplies
its original source and flags; any other pattern and flags are converted
with `ToString`, pattern first, exactly as the constructor converts them. The
receiver keeps its identity: RegExpInitialize replaces only its matcher, and
an invalid pattern or flag text throws a `SyntaxError` with the receiver
unchanged. The `lastIndex` reset that follows throws a `TypeError` on a
non-writable `lastIndex`, after the receiver already holds the new pattern.

A RegExp pattern passes its matcher as the origin, so an equal parse borrows
that program, the same rule the constructor uses; a compiled artifact is
never shared once its source or parse flags differ. Recompiling a literal
changes only that object, and the next evaluation of the literal still
allocates a fresh RegExp over the build-time artifact. Built-in execution
reads the matcher after it converts `lastIndex`, so a `valueOf` that calls
`compile` runs the new pattern, as do the `@@split` cases that recompile from
a `Symbol.match` getter or the limit conversion.

The method takes code ID `OSEO_REGEXP_COMPILE_CODE_ID`, the RegExp range last
minus 21, below the symbol-method block. It adds no intrinsic slot, heap
kind, or entry point, and the runtime ABI moves to `m5-158`. The fixed fixture
*tests/native/fixtures/annexb-regexp-compile.ts* covers the descriptor,
receivers, argument checks, conversion order and abrupt conversion, invalid
patterns and flags, the non-writable and frozen cases, subclass and literal
receivers, the Annex B grammar through `compile`, the recompiling `@@split`
and `exec` cases, flag order, and a shape guard miss.
*tests/property/m5-annexb-regexp-compile.property.test.ts*, seed block
`0x6000a100`, generates sequences of `compile` calls, `lastIndex` writes and
locks, and executions on literal, constructed, and subclass receivers and
compares each state and match with a fresh RegExp and with both hosts.


Small ECMAScript 2026 built-in families
---------------------------------------

These families come from the `error-is-error`, `math-sum-precise`, `upsert`,
and `iterator-concat` units. Of their 126 test262 paths, 123 pass. The other
three build a value with the `Function` constructor and are ADR 0016
exclusions: *non-error-objects-other-realm.js* for `Error.isError` and one
`getOrInsertComputed` row each for `Map` and `WeakMap`. The fixtures cover
their other assertions. Each record's standards class cites the results
partitions that hold its rows.

### `Error.isError`

`Error.isError(value)` is a writable, non-enumerable, configurable own property
of `%Error%` with length 1. It is an ordinary built-in function and not a
constructor. The other error constructors inherit it through their
`[[Prototype]]`.

It returns `true` exactly when `value` is an object with an `[[ErrorData]]`
internal slot. The runtime sets that slot when an error constructor creates
the object, whether through a call, `new`, `super()` in a subclass, or
`Reflect.construct`, and on every error the runtime throws itself. It reads no
property and runs no user code, so the answer for a given object never changes:
replacing its prototype keeps the slot. A proxy has no slot of its own, so a
proxy of an error answers `false` without consulting its target or handler, as
does an object that only inherits from an error prototype. The error prototypes
themselves are ordinary objects and answer `false`. Errors from another realm
answer `true`.

Both reference hosts implement it, so the fixtures and the property suite are
differential against Node.js and Deno. The property suite also checks each
generated subject against a model of which construction paths create the slot.
The family record is
[*error-is-error.yaml*](./language-profile-es2026/families/error-is-error.yaml).

### `Math.sumPrecise`

`Math.sumPrecise(items)` is a writable, non-enumerable, configurable function
property of `Math` with length 1, appended after the earlier Math functions. It
is not a constructor.

It rejects `undefined` and `null` before reading an iterator, then iterates
`items` and requires every value to be a Number. A non-Number value, including
a BigInt or a Number object, closes the iterator and throws a `TypeError`, even
after an earlier NaN has already fixed the result. The result follows the
edition's state machine: no values or only `-0` values give `-0`, NaN or both
infinities give NaN, one infinity gives that infinity, and otherwise the result
is the exact sum of the finite values rounded once to the nearest Number with
ties to even. An exact sum of zero is `+0`, and a sum at or beyond
2<sup>1024</sup> − 2<sup>970</sup> in magnitude rounds to an infinity of its
sign.

The pinned Node.js does not expose the function, so Deno is the single
reference host. The property suite checks every generated case against an
independent BigInt model that sums each value's exact 2<sup>-1074</sup>
multiple and rounds once. The family record is
[*math-sum-precise.yaml*](./language-profile-es2026/families/math-sum-precise.yaml).

### Map and WeakMap upsert

`getOrInsert(key, value)` and `getOrInsertComputed(key, callbackfn)` are
writable, non-enumerable, configurable function properties of
`%Map.prototype%` and `%WeakMap.prototype%`, each with length 2. None is a
constructor, and each rejects a receiver without the matching `[[MapData]]` or
`[[WeakMapData]]` slot with a `TypeError`.

The Map forms canonicalize `-0` to `+0` and find the key by SameValueZero.
`getOrInsert` returns the existing value or appends the key with `value`.
`getOrInsertComputed` first requires a callable `callbackfn`. When the key is
absent it calls `callbackfn` once with `undefined` as the receiver and the
canonical key as the only argument, then looks the key up again: if the
callback inserted it, the computed value replaces the callback's value in
place, and otherwise the key is appended, even after the callback deleted
entries or cleared the map. A throwing callback stores no computed value and
propagates its throw; any change the callback made to the map itself, including
inserting the key, remains.

The WeakMap forms first reject a key that CanBeHeldWeakly refuses, which
includes every primitive other than an unregistered Symbol, and the computed
form then rejects a non-callable `callbackfn`. They store through the existing
ephemeron table, so a value stays reachable exactly as long as its key, and a
callback that set the key itself sees its value replaced.

The pinned Node.js lacks these methods, so Deno is the single reference host.
The property suite checks generated operation sequences against an
independent model of the edition steps. The family record is
[*upsert.yaml*](./language-profile-es2026/families/upsert.yaml).

### `Iterator.concat`

`Iterator.concat(...items)` is a writable, non-enumerable, configurable own
function property of `%Iterator%` with length 0. It is not a constructor.

When called it requires every item to be an object, reads each item's
`Symbol.iterator` method exactly once, and rejects an `undefined`, `null`, or
non-callable method with a `TypeError`. It opens nothing. The result inherits
from `%IteratorHelperPrototype%`. Each `next` call forwards the active inner
iterator's next value in a fresh result object. When that iterator is done, it
opens the next item by calling its captured method with the item as the
receiver and reading `next` once, and it reads `value` only from results that
are not done. A non-object iterator or step result is a `TypeError`. Any throw
while opening or stepping completes the result without closing anything.

`return` before the first `next`, and after completion, closes nothing.
`return` while a value is suspended closes only the forwarded inner iterator,
with no arguments, and propagates a throw or a non-object result from its
`return` method. Calling `next` or `return` while the result is running is a
`TypeError`.

The pinned Node.js lacks the function, so Deno is the single reference host.
The property suite checks generated item lists and consumption schedules
against an independent model of the closure. The family record is
[*iterator-concat.yaml*](./language-profile-es2026/families/iterator-concat.yaml).


Joint iteration
---------------

The `iterator-zip` unit implements `Iterator.zip` and `Iterator.zipKeyed` from
the joint iteration feature. All 82 of its test262 rows pass, and the family
record's standards class cites the results partitions that hold them. Six of
those rows include *iteratorZipUtils.js*, which the reviewed harness now
carries unchanged from the pinned revision.

### `Iterator.zip` and `Iterator.zipKeyed`

Both are writable, non-enumerable, configurable own function properties of
`%Iterator%` with length 1, and neither is a constructor. Each takes an object
of iterables and an optional options object. A non-object `iterables` is a
`TypeError` before the options are read.

The options must be `undefined` or an object. `mode` must be `undefined`,
`"shortest"`, `"longest"`, or `"strict"`, with no conversion, so a String
object is rejected. Only `"longest"` reads `padding`, which must then be
`undefined` or an object. The options are read before any iterable is opened.

`Iterator.zip` opens `iterables` with `Symbol.iterator`, steps it to the end,
and opens each value with GetIteratorFlattenable: the value must be an object,
a nullish `Symbol.iterator` uses the object itself as the iterator, and `next`
is read once. A primitive, a string included, is a `TypeError`. Its padding is
the first values of the padding iterable, which is closed if it has more, and
`undefined` past its end. `Iterator.zipKeyed` instead walks the own keys of
`iterables`, symbols included, through `[[OwnPropertyKeys]]` and
`[[GetOwnProperty]]`. It skips a key whose property is absent or not
enumerable and a value that is `undefined`, and reads its padding by key.

Each `next` steps every remaining iterator in order and yields a fresh array,
or for `zipKeyed` a fresh null-prototype object with one writable, enumerable,
configurable property per key. When an iterator is done, `"shortest"`
finishes. `"strict"` finishes only if that is the first iterator and stepping
each other one once, without reading `value`, finds it done too; otherwise it
throws a `TypeError`. `"longest"` drops the iterator, uses its padding from
then on, and finishes when none remains.

Every finish and every abrupt completion closes the iterators that are still
open, from the last to the first. That covers a throw while collecting the
iterators or the padding, where a failed open in `zip` also closes `iterables`
last, a throw from a step, and `return` before the first `next` or at a
yield. When the completion is a return, the first `return` method that throws
or answers a non-object replaces it with that error, and the remaining
iterators still close with their errors suppressed. Calling `next` or `return`
while the result is running is a `TypeError`, including from a `return` method
that a `return` at a yield calls.

Neither pinned reference host implements these functions. The fixtures run on
Node.js and Deno over an independent model written from the specification
text, *tests/native/iterator-zip-model.ts*, which installs both functions and
builds each result on `Iterator.prototype.map`. Node.js 24.21.0 marks a helper
completed before a `return` at a yield closes, unlike GeneratorResumeAbrupt, so
the probe of that state runs on Deno alone. The property suite,
*tests/property/es2026-iterator-zip.property.test.ts* with seed block
`0x6000ab00`, generates inputs, modes, padding, and consumption schedules,
and checks the native result against a second model of the closure and the
reference model on Node.js. The family record is
[*iterator-zip.yaml*](./language-profile-es2026/families/iterator-zip.yaml).


`Array.fromAsync`
-----------------

`Array.fromAsync(asyncItems [, mapfn [, thisArg]])` is a writable,
non-enumerable, configurable own function property of `%Array%` with length 1.
It is not a constructor. It always returns a new `%Promise%`: the edition runs
its closure through AsyncFunctionStart, so the steps before the first Await
run during the call and every abrupt completion, including a non-callable
`mapfn` or an `undefined` or `null` input, rejects that promise instead of
throwing.

The closure reads `Symbol.asyncIterator`, then `Symbol.iterator` only when the
first is absent, and calls the method it found. An async iterator's values are
not awaited. A synchronous iterator goes through the Async-from-Sync wrapper,
so each value is awaited and a rejected value closes the iterator. A value
with neither method is an array-like object: its length is read once, and
each element is read and awaited in index order. A mapper result is awaited
too. A constructor receiver is constructed with no arguments for an iterable
and with the length for an array-like; any other receiver gets an ordinary
array. Elements are defined with CreateDataPropertyOrThrow, and the length is
set at the end.

A failure of the mapper, of the Await on its result, or of an element
definition closes an iterator and awaits its `return` result, and the
original error rejects the promise whatever `return` does. A synchronous
iterator with no `return` still closes through the wrapper, whose promise
resolves with a `{ value: undefined, done: true }` object, so an inherited
`then` is read and a callable one decides when the close settles. A failure of
the iterator itself, of its result object, or of the final length Set
propagates without a close.

Node.js and Deno are both reference hosts, and the fixtures match them turn
for turn except where V8 departs from the edition. V8 reads a synchronous
iterator's `next` twice, closes that iterator a second time when a value
rejects, closes an async iterator after a failure of its own step or of the
final length Set, and never settles the promise when the close's `return`
lookup or call throws or its result rejects. The `array-from-async-edition`
fixture checks those cases against the edition's steps, and the property suite
compares them with its model alone.

The property suite generates async iterables, synchronous iterables, and
array-likes of numbers, promises, thenables, and rejected promises, with
failing `next` steps, six mapper kinds, and three receivers, and compares the
settled result and the order of observable steps with an independent model of
the closure. All 95 test262 paths pass, and the family record's standards
class cites the results partitions that hold them. Seven of them need
`TemporalHelpers.observeProperty`, which the reviewed *temporalHelpers.js*
keeps for them. The family record is
[*array-from-async.yaml*](./language-profile-es2026/families/array-from-async.yaml).


JSON source text
----------------

`JSON.rawJSON` and `JSON.isRawJSON` are writable, non-enumerable, configurable
own function properties of the JSON namespace with length 1, defined after
`stringify`. Neither is a constructor.

`JSON.rawJSON(text)` converts its argument with ToString and requires one JSON
null, boolean, number, or string with no leading or trailing tab, line feed,
carriage return, or space. An empty text, an array or object, or any other
text throws a `SyntaxError`. The result is a frozen object with a `null`
prototype, the `[[IsRawJSON]]` internal slot, and one enumerable `rawJSON`
property that holds the text. `JSON.isRawJSON(value)` answers whether its
argument has that slot, so a proxy of a raw JSON object, an object that
inherits from one, and a lookalike object answer `false`. `JSON.stringify`
emits a raw JSON object's text unchanged wherever the value reaches
serialization after `toJSON` and the replacer, which lets a BigInt or an exact
decimal reach the output.

With a callable reviver, `JSON.parse` passes a third argument, a fresh
ordinary object. For a primitive whose holder property still has the parsed
value, that object has a `source` property with the exact source text of the
value; for every other call it has no own property. A value a reviver added,
or replaced by a different value, gets no source, and a replaced container's
children get none either. For a repeated member name the record of the last
member applies, as its value does.

Both Node.js and Deno implement these functions and the context argument, and
the fixtures match them byte for byte. The property suite generates nested
JSON texts with exact number and string literals, repeated member names,
whitespace, and sibling replacements, and compares the reviver's calls, the
revived value, and a `JSON.rawJSON` round trip of every literal with an
independent model of InternalizeJSONProperty and with both hosts. All 21
test262 paths of the unit pass, and the family record's standards class cites
the results partitions that hold them; the other 144 *test/built-ins/JSON/*
paths still pass. The family record is
[*json-parse-source.yaml*](./language-profile-es2026/families/json-parse-source.yaml).


Uint8Array base64 and hex
-------------------------

The `uint8array-base64` unit adds six functions. `Uint8Array.fromBase64` and
`Uint8Array.fromHex` are own properties of `%Uint8Array%`, and `toBase64`,
`setFromBase64`, `toHex`, and `setFromHex` are own properties of
`%Uint8Array.prototype%`, in that order. Each is writable, non-enumerable, and
configurable, is not a constructor, and has length 1, except `toBase64` and
`toHex`, which have length 0. No other typed array constructor or prototype
has them.

The prototype methods require a `Uint8Array` receiver and throw a `TypeError`
for any other value, including the other typed arrays, before they read an
argument. The input of the decoding functions must be a String; it is never
coerced. The options argument must be `undefined` or an object. `alphabet`
must be `undefined`, `"base64"`, or `"base64url"`, and `lastChunkHandling`
must be `undefined`, `"loose"`, `"strict"`, or `"stop-before-partial"`; any
other value, including a String object, is a `TypeError` and is never
coerced. Each option is read once, in the edition's order, and `omitPadding`
goes through ToBoolean.

`toBase64` and `toHex` check that the receiver's buffer is attached and the
view in bounds only after every option read, so a getter that detaches the
buffer or shrinks a resizable buffer makes them throw a `TypeError`, and a
getter that writes an element changes the encoded text. A length-tracking view
of a resizable buffer encodes its current length. `toHex` writes lowercase
digits.

`fromBase64` follows the edition's FromBase64 operation. It skips ASCII
whitespace (tab, line feed, form feed, carriage return, and space) anywhere,
rejects any other character outside the chosen alphabet, and decodes four
digits at a time. With `"loose"`, the default, a final chunk of two or three
digits decodes without padding and ignores nonzero padding bits. `"strict"`
requires padding and zero padding bits. `"stop-before-partial"` leaves a final
partial chunk undecoded instead of failing. A malformed input is a
`SyntaxError`. The result is a fresh `%Uint8Array%` over a fixed-length
buffer, whatever the receiver. `fromHex` accepts an even number of
hexadecimal digits in either case.

`setFromBase64` and `setFromHex` decode into the receiver and return a fresh
object with `read` and `written` properties. They check the receiver's bounds
after the option reads and decode at most its length in bytes. Once the
target is full at a chunk boundary, decoding stops and the rest of the input
is not examined. A base64 chunk that would not fit is left unread. When the
input is malformed, the bytes decoded before the error are written and then
the `SyntaxError` is thrown. A hex input of odd length throws before anything
is written.

The pinned Node.js lacks these functions, so Deno is the reference host. Deno
2.9.7 does not stop once `setFromBase64` fills its target: it keeps checking
the remaining input and throws on a character that the edition never reads,
which the pinned *setFromBase64/trailing-garbage.js* row rejects. An
independent model written from the edition, in
*tests/native/uint8array-base64-model.ts*, is therefore a second reference.
The fixtures compare native output with the model in Node.js and with Deno,
except for one fixture of filled targets that only the model judges. The
property suite generates byte sequences, edited encodings, and plain, offset,
length-tracking, detached, and shrunk targets, checks round trips and partial
decodes against the model, and compares with Deno where Deno follows the
edition. The family record is
[*uint8array-base64.yaml*](./language-profile-es2026/families/uint8array-base64.yaml).

Of the 70 *test/built-ins/Uint8Array/* rows for these functions, the unit owns
68, and all 68 pass; the family record's standards class cites the results
partitions that hold them. The two
*throws-when-target-is-backed-by-immutable-arraybuffer.js* rows need immutable
`ArrayBuffer`, a proposal, and stay excluded.


`Atomics.pause`
---------------

The `atomics-pause` unit adds `Atomics.pause`, one of the three ECMAScript 2027
features in the claim. It is a writable, non-enumerable, configurable own
property of the `Atomics` namespace with length 0, follows the thirteen
earlier Atomics functions in creation order, and is not a constructor.

`Atomics.pause(N)` accepts an `undefined` or absent count and any integral
Number, including `-0`, negative integers, and integers beyond 2<sup>53</sup>.
Any other count is a `TypeError` without coercion: NaN, the infinities,
fractions, Strings, BigInts, Number objects, and objects with `valueOf` or
`Symbol.toPrimitive`, which are never called. It ignores its receiver and any
further arguments and returns `undefined`.

The edition lets an implementation signal the processor that the caller is
spinning and leaves the form of that signal to it. Oseo executes one
processor hint per call whatever the count, so a large count never stalls the
agent. The hint is a target choice that each target description records as
`atomicsPauseHint`: `x86-pause`, the PAUSE instruction, for
`linux-x86_64-gnu`, and `aarch64-yield`, the YIELD instruction, for
`macos-aarch64` and `linux-aarch64-musl`. The runtime refuses to build for an
architecture without a recorded hint. The hint is not observable from a
program, so tests check the choice structurally.

Both reference hosts expose the function, so the fixture is differential
against Node.js and Deno. The count domain is one predicate that the fixture
covers class by class, so the unit adds no property suite. The family record
is
[*atomics-pause.yaml*](./language-profile-es2026/families/atomics-pause.yaml).
The unit owns the five *test/built-ins/Atomics/pause/* rows, and all five
pass; the family record's standards class cites the results partitions that
hold them.


Explicit resource management
----------------------------

The `disposal-intrinsics` unit adds the built-ins of the ECMAScript 2027
explicit resource management feature, and the `using-declarations` unit adds
`using` and `await using`; see [Declarations](#declarations). Of its 240
test262 rows under *test/built-ins/*, 236 pass in the full test262 observation.
The other four construct a new target with the `Function` constructor, three
of them of another realm, and are ADR 0016 exclusions:
*proto-from-ctor-realm.js* for each of the three constructors and
*SuppressedError/newtarget-proto-fallback.js*. The witness in
*tests/disposal-dynamic-source-native.test.ts* runs their other assertions
with a literal function in place of the constructed one, and the M5c
exclusion audit binds it. The record's standards class cites the results
partitions that hold the rows.

### Built-ins

`SuppressedError(error, suppressed, message)` is a global constructor with
length 3 whose `[[Prototype]]` is `%Error%`. It creates an object with
`[[ErrorData]]`, so `Error.isError` answers `true`. A defined `message` is
converted to a string first; then `error` and `suppressed` become writable,
non-enumerable, configurable own properties. It reads no options and installs
no `cause`.

`Symbol.dispose` and `Symbol.asyncDispose` are well-known symbols shared by
every realm, so the table M5 fixed at thirteen entries now has fifteen.
`%Iterator.prototype%[Symbol.dispose]` calls the receiver's `return` method, if
it has one, and returns `undefined`. The asynchronous form,
`%AsyncIteratorPrototype%[Symbol.asyncDispose]`, calls `return` with no
arguments, passes its result
through `PromiseResolve`, and returns a promise for `undefined`; every abrupt
step rejects that promise instead of throwing. The pinned Node.js passes one
`undefined` argument to `return`; Oseo follows the pinned test262, which
expects none, and the fixtures do not observe the argument count.

`DisposableStack` and `AsyncDisposableStack` require `new` and take their
prototype from the new target, falling back to the new target's realm. `use`,
`adopt`, `defer`, and `move` throw a `ReferenceError` once the stack is
disposed, and every member throws a `TypeError` on a receiver of the other
kind. `use` reads the dispose method once, when the resource is added; a
synchronous stack ignores `null` and `undefined`, while an asynchronous stack
records them so that disposal still awaits once. An asynchronous stack falls
back to `Symbol.dispose` and discards that method's result. `move` returns a
stack of the running realm's intrinsic prototype that owns every resource and
leaves the receiver disposed and empty. `use` captures the stack's
DisposeCapability before it reads the dispose method, so a `Symbol.dispose`
getter that calls `move` adds its resource to the moved stack. The pinned
Node.js and Deno add it to the disposed source instead, so that fixture
compares with the edition's output rather than the hosts.

Disposal visits the resources in reverse order. A failure replaces the stored
completion: the first one directly, each later one with a `SuppressedError`
whose `error` is the new failure and whose `suppressed` is the earlier
completion. `disposeAsync` awaits each asynchronous result, awaits once before
a synchronous resource that follows a `null` one, and settles its promise with
the final completion; a second call returns a promise already fulfilled.

Both reference hosts implement the feature. The fixtures compare with Node.js
and Deno, and the property suite compares with Node.js. The fixtures avoid
three V8 details: the own `stack` property of every error, the order of some
own keys, and the `message` V8 gives the `SuppressedError` that disposal
creates, which the edition does not define. The property suite also checks
generated stacks against an independent model of the disposal order and the
`SuppressedError` chain. The family record is
[*disposal-intrinsics.yaml*](./language-profile-es2026/families/disposal-intrinsics.yaml).

### Declarations

A `using` or `await using` declaration binds like `const`: the binding is
immutable, has a TDZ, and names an anonymous function initializer. Before it
initializes the binding, the declaration adds the value to its scope's
DisposeCapability, so a value that is neither an object, `null`, nor
`undefined`, or that has no callable dispose method, throws there and the
binding stays uninitialized. `await using` looks for `Symbol.asyncDispose`
first and falls back to `Symbol.dispose`. The early errors are the Babel
parser's: an initializer and a plain identifier are required, and neither form
may appear at the top level of a Script, directly in a case clause, or as a
`for-in` head, nor `await using` outside an asynchronous function or a module.

Every scope that declares one is an
[ADR 0017](./adr/0017-structured-cleanup-regions.md) cleanup region: a block,
a function or static block body, a module's top level, the loop environment of
a classic `for` head, and each iteration of a `for-of` or `for await` head.
Each transfer that leaves the region, including a generator's `return`,
disposes the scope's resources in reverse order and then resumes, while a
transfer that stays inside does not. A per-iteration region sits inside the
loop's iterator close, so a same-loop `continue` disposes without closing the
iterator, and a `break` disposes and then closes it. Failures fold into the
pending completion as the built-ins' `SuppressedError` chain does.

`await using` performs each Await of DisposeResources in its own suspended
frame, as an `await` expression does, so a block whose `await using` ran
continues in a later microtask, while a block that added nothing continues in
the same one. The pending completion stays in the frame's completion slots
across the suspension, which
[ADR 0011](./adr/0011-asynchronous-continuations.md) already traces, so ADR
0017 needs no amendment. A module with a top-level `await using` evaluates
asynchronously.

In the full test262 observation, 118 of the 184 rows under
*test/language/statements/* pass and 63 report the `SyntaxError` they expect.
The other three call `eval` and are ADR 0016 exclusions: *using/cptn-value.js*
and the two *not-allowed-at-top-level-of-eval.js* syntax rows. The same
witness evaluates their source text as literal ADR 0029 host Scripts, and the
record's standards class cites the results partitions that hold the rows.

The fixtures compare with Node.js and Deno, except one: the pinned Deno rejects
`using` in a classic `for` head as a syntax error, so that fixture compares
with Node.js alone. The module fixture runs top-level `using` and `await using`
across an import. The property suite generates nested scopes of synchronous,
asynchronous, fallback, and `null` resources, loop heads, and abrupt exits,
and checks the disposal order and the final completion against an independent
model and Node.js. The family record is
[*using-declarations.yaml*](./language-profile-es2026/families/using-declarations.yaml).
