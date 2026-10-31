Resolve mixed Annex B ordinary-object prototype coverage
========================================================

Scope and accounting
--------------------

Item 3 of the 2026-10-28 *m5c-scope-big-node-split* maintainer decision
closes a mixed Annex B path under ADR 0013's optional Annex B boundary only
when reviewed replacement observations cover every core subject and a
fresh-digest audit record names them. Otherwise the path stays here. The
class-private-accessor-lookup-coverage-remediation precedent kept its two
paths because not every core subject could be covered.

This node owned exactly one reviewed unsupported path,
*test/language/types/object/S8.6.2\_A8.js*. Observation-batch-28 admitted it
as `unsupported-profile-feature` with dependencies `object-literals`,
`object-properties` and `var-bindings`. Focused observation on base
`999f3416fdc62e2c28c2d067f22797306a781af2`, native target
`linux-x86_64-gnu`, rejects the source at compile time in all four variants,
non-strict and strict with specialization enabled and disabled:

~~~~ text
error[OSEO1001]: The Object.prototype.__proto__ accessor is excluded by Annex B.
~~~~

The reviewed executor stopped at its first variant and recorded the
`profile-syntax` capability, so no assertion of the original source ran. Raw
records, source hashes and natural exits are in
[the observation packet](/data/m5c-d17-20261031/ob28/). The path now closes:
its only Annex B subject is the accessor write, and every core subject has
fixed native evidence. ADR 0013, ADR 0016, ADR 0019, the subset, the original
source and assertions, and the recorded unsupported result are unchanged.
The path is not counted as a pass.


Per-path assertions
-------------------

Section names are ECMA-262 16th edition clause ids.

### *test/language/types/object/S8.6.2\_A8.js*

| Upstream assertion or step                      | Kind    | Section                                | Replacement                              |
| ----------------------------------------------- | ------- | -------------------------------------- | ---------------------------------------- |
| `var x = Object.preventExtensions({})`          | core    | sec-object.preventextensions           | same step; `Object.isExtensible` false   |
| `var y = {}`                                    | core    | sec-object-initializer                 | same step; `y` has `Object.prototype`    |
| `x.__proto__ = y`                               | Annex B | sec-set-object.prototype.\_\_proto\_\_ | not replicated                           |
| `try`/`catch` swallows that write's failure     | core    | sec-ordinarysetprototypeof             | `setPrototypeOf` throws; `Reflect` false |
| `Object.getPrototypeOf(x) !== Object.prototype` | core    | sec-object.getprototypeof              | `Object.is` equality after each refusal  |

The accessor setter calls `O.[[SetPrototypeOf]](proto)` and throws `TypeError`
when that operation returns false, which is what
`Object.setPrototypeOf` (20.1.2.20) does directly.
`Reflect.setPrototypeOf` (28.1.13) reports the same false result without the
language error. `OrdinarySetPrototypeOf` (10.1.2.1) returns false when the
object is not extensible, so the upstream prototype assertion tests that
refusal rather than the accessor. The fixture also changes an extensible
object's prototype both ways, so the refusal follows from the
non-extensible state and not from the operation.


Replacement evidence
--------------------

*../../tests/native/fixtures/annex-b-mixed-core.ts* holds four fixtures for
the earlier TypedArray and RegExp split paths and one for this path. Each
compares value and type with `Object.is` inside the program, then prints one
line. Before any subject, the program counts six near-miss values the
comparator must reject: `1`/`"1"`, `undefined`/`"undefined"`,
`null`/`undefined`, `true`/`"true"`, `0`/`-0`, and `10`/`"10"`. A plain `!==`
check of that count, not the comparator, decides the verdict.

The `annex-b-core-ordinary-object-set-prototype` fixture keeps the
`preventExtensions` call, the attempted prototype change, and the assertion
that `Object.getPrototypeOf(x)` is still `Object.prototype`. It checks
`Object.isExtensible(x)` is false, that `Object.setPrototypeOf(x, y)` throws
`TypeError` and `Reflect.setPrototypeOf(x, y)` returns false, and that each
refusal leaves `Object.prototype`. It then changes the prototype of an
extensible ordinary object to `y` and to `null`, and confirms `x` is
unchanged.

*../../tests/annex-b-mixed-core-native.test.ts* runs each program in a fresh
V8 context in both strictness modes. It also replaces the comparator with an
always-true, a same-type, and a loose-equality comparator; each mutant must
throw before printing. Natively, each fixture matches fixed expected output
and the Node.js and Deno references, then runs strict and non-strict Scripts
under both specialization policies with collection at every safepoint. The
collection counter must be positive, and an unsupported native host skips
these cases. *tests/native.ts* is unchanged because the fixture is not in its
lists and another audit assessment binds its digest.


Audit record
------------

*docs/m5c-closure/exclusion-audit.yaml* keeps the path row, with current
source and observation digests, and changes
`annex-b-ordinary-object-prototype` to `disposition: exclusion` and
`normativeDependency: annex-b-only`. It binds the digests of both evidence
files. The ledger moves the path to `adr:0013-m5-edition-and-manifest`
through the ledger API and `mise run m5c:closure-ledger:update`. This node
then owns no path.

| Path                                  | Outcome  | Assessment                          |
| ------------------------------------- | -------- | ----------------------------------- |
| *language/types/object/S8.6.2\_A8.js* | excluded | `annex-b-ordinary-object-prototype` |

The exclusion reopens on changed source, observation, or replacement
evidence, on an amendment of ADR 0013's optional Annex B policy, or on an
ADR 0019 reopening trigger.

Root owns D3, any UPDATE, outer review, publication, merge, and landed state.
