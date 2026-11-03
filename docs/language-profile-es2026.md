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
behavior, never intended behavior. The Annex B built-in units and the small
ECMAScript 2026 built-in units hold the family records so far; see
[Annex B built-ins](#annex-b-built-ins) and
[Small ECMAScript 2026 built-in families](#small-ecmascript-2026-built-in-families).


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
family, and dynamic import stay inside the claim, and
[ADR 0016](./adr/0016-dynamic-source-boundary.md) still keeps them outside the
profile. Realms, agents, shared memory, and host hooks keep the treatment of
[ADR 0013](./adr/0013-m5-edition-and-manifest.md).

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

The added paths are not in the reviewed subset or the manifest. Each is
`unreviewed` in the [closure ledger](./m5c-closure/README.md) with the
`unit:<id>` owner of the *PLAN-LANGUAGE.md* unit that implements it. A unit
admits its rows into *tests/test262/subset.yaml* with reviewed dependency tags
when its behavior lands, and the full manifest update observes them.

`mise run check:language-claim-audit` applies the closure conditions of
[ADR 0019](./adr/0019-m5-claim-closure.md) to the expanded inventory. It
requires zero semantic, harness, and infrastructure failures and an owner for
every unsupported path, and it counts the open unreviewed and remediation
paths of each unit. It rejects a path that still has the ADR 0013 owner,
because ADR 0032 withdrew that record's Annex B authorization; the 11 former
ADR 0013 rows count as remediation of their units. `language-exit-audit` runs
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
column. `annexb-dynamic-source-accounting` adds no family: its rows become
ADR 0016 results through reviewed exclusion audit rows.


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


Small ECMAScript 2026 built-in families
---------------------------------------

These families come from the `error-is-error`, `math-sum-precise`, `upsert`,
and `iterator-concat` units. Their test262 rows stay `unreviewed` in the
closure ledger until the unit admits them, so each record names its standards
evidence as pending and lists the fixtures that cover the same behavior.

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
