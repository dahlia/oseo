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
behavior, never intended behavior. No family record exists yet: the
`claim-boundary` unit moved the boundary and admitted no new behavior.


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
paths of each unit. `language-exit-audit` runs it with `--require-closed`,
which also requires both counts to be zero. `mise run report:language-coverage`
prints the counts. The M5 denominator and this one stay separate: a percentage
of this claim uses the 43,007 included paths.


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
