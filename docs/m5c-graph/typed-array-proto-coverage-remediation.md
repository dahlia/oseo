TypedArray prototype Annex B closure
====================================

Scope and accounting
--------------------

Item 3 of the 2026-10-28 *m5c-scope-big-node-split* maintainer decision
closes a mixed Annex B path under ADR 0013's optional Annex B boundary only
when reviewed replacement observations cover every core subject and a
fresh-digest audit record names them. Otherwise the path stays here. The
class-private-accessor-lookup-coverage-remediation precedent kept its two
paths because not every core subject could be covered.

This node owned three paths. Each upstream observation is `OSEO1001` for the
`Object.prototype.__proto__` accessor, so no assertion of the original
source ran. All three now close: their only Annex B subject is the accessor,
and every core subject has fixed native evidence. ADR 0013, ADR 0016, ADR
0019, the subset, the original sources and assertions, and the recorded
unsupported results are unchanged. These paths are not counted as passes.


Per-path assertions
-------------------

Section names are ECMA-262 16th edition clause ids.

### *test/built-ins/TypedArrayConstructors/ctors/no-species.js*

| Upstream assertion or step                                        | Kind    | Section                                | Replacement                  |
| ----------------------------------------------------------------- | ------- | -------------------------------------- | ---------------------------- |
| `GrossBuffer extends ArrayBuffer`, `new GrossBuffer(1024)`        | core    | sec-arraybuffer-constructor            | same steps; one construction |
| throwing constructor and `Symbol.species` getter are never called | core    | sec-initializetypedarrayfromtypedarray | counters stay 1 and 0        |
| `new Uint8Array(grossBuf)`, `new Int8Array(grossTA)`              | core    | sec-initializetypedarrayfromtypedarray | same steps; length 1024      |
| `mysteryTA.buffer.__proto__` read                                 | Annex B | sec-get-object.prototype.\_\_proto\_\_ | not replicated               |
| buffer `[[Prototype]]` is `ArrayBuffer.prototype`                 | core    | sec-object.getprototypeof              | `Object.getPrototypeOf`      |
| `mysteryTA.buffer.constructor` is `ArrayBuffer`                   | core    | sec-arraybuffer.prototype.constructor  | same assertion               |

The getter returns `ToObject(this).[[GetPrototypeOf]]()`, which
`Object.getPrototypeOf` observes. The fixture also clones a view of every
built-in constructor and checks each fresh buffer and view prototype.

### Resizable and fixed-length views

*test/built-ins/TypedArray/prototype/resizable-and-fixed-have-same-prototype.js*

| Upstream assertion or step                            | Kind    | Section                                | Replacement                     |
| ----------------------------------------------------- | ------- | -------------------------------------- | ------------------------------- |
| harness `ctors`, `CreateResizableArrayBuffer(40, 80)` | core    | sec-arraybuffer-constructor            | the same 15 constructors        |
| `new ctor(rab, 0, 3)` and `new ctor(ab, 0, 3)`        | core    | sec-allocatetypedarray                 | same steps; buffers and lengths |
| `ta_ab.__proto__` and `ta_rab.__proto__` reads        | Annex B | sec-get-object.prototype.\_\_proto\_\_ | not replicated                  |
| both views share one `[[Prototype]]`                  | core    | sec-object.getprototypeof              | `Object.getPrototypeOf` on both |

The 15 constructors are the reviewed harness list on a host with
`Float16Array`, including `MyUint8Array`, `MyFloat32Array`, and
`MyBigInt64Array`. The fixture also checks each prototype is the
constructor's own.

### *test/built-ins/TypedArray/out-of-bounds-behaves-like-detached.js*

| Upstream assertion or step                 | Kind    | Section                                | Replacement                 |
| ------------------------------------------ | ------- | -------------------------------------- | --------------------------- |
| 16/40-byte resizable buffer, length-4 view | core    | sec-typedarray                         | same steps                  |
| `i8a.__proto__ = { 2: 'wrong value' }`     | Annex B | sec-set-object.prototype.\_\_proto\_\_ | not replicated              |
| `[[SetPrototypeOf]]` to that plain object  | core    | sec-object.setprototypeof              | `Object.setPrototypeOf`     |
| `i8a[2] = 10; i8a[2] === 10`               | core    | sec-typedarray-get                     | same assertion              |
| `2 in i8a`                                 | core    | sec-typedarray-hasproperty             | same assertion              |
| `rab.resize(0)`                            | core    | sec-arraybuffer.prototype.resize       | same step; view length is 0 |
| `i8a[2] === undefined` out of bounds       | core    | sec-isvalidintegerindex                | same assertion              |
| `!(2 in i8a)` out of bounds                | core    | sec-isvalidintegerindex                | same assertion              |

The setter calls `O.[[SetPrototypeOf]](proto)`, the operation
`Object.setPrototypeOf` performs. The fixture also checks index 0, an index
past the view length that the prototype has, the retained prototype, and the
view after regrowing.


Replacement evidence
--------------------

*tests/native/fixtures/annex-b-mixed-core.ts* holds three fixtures for these
paths and one for `regexp-split-coverage-remediation`. Each compares value
and type with `Object.is` inside the program, then prints one line. Before
any subject, the program counts six near-miss values the comparator must
reject: `1`/`"1"`, `undefined`/`"undefined"`, `null`/`undefined`,
`true`/`"true"`, `0`/`-0`, and `10`/`"10"`. A plain `!==` check of that
count, not the comparator, decides the verdict.

*tests/annex-b-mixed-core-native.test.ts* runs each program in a fresh V8
context in both strictness modes. It also replaces the comparator with an
always-true, a same-type, and a loose-equality comparator; each mutant must
throw before printing. Natively, each fixture matches fixed expected output
and the Node.js and Deno references, then runs strict and non-strict Scripts
under both specialization policies with collection at every safepoint. The
collection counter must be positive, and an unsupported native host skips
these cases.

The earlier `typed-array-buffer-without-species-core`, out-of-bounds, and
constructor-pair fixtures stay as they are. The closing assessments bind only
the new strict evidence, because the earlier fixtures print values that
`String()` could make indistinguishable. *tests/native.ts* is unchanged
because another audit assessment binds its digest.


Audit records
-------------

*docs/m5c-closure/exclusion-audit.yaml* keeps each path row, with current
source and observation digests, and changes three assessments to
`disposition: exclusion` and `normativeDependency: annex-b-only`. They are
`annex-b-typed-array-prototype`, `annex-b-resizable-typed-array-prototype`,
and `annex-b-out-of-bounds-prototype-setup`. Each binds the digests of both
evidence files. The ledger moves the three paths to
`adr:0013-m5-edition-and-manifest` through the ledger API and
`mise run m5c:closure-ledger:update`. This node then owns no path.

| Path                                                              | Outcome  | Assessment                                |
| ----------------------------------------------------------------- | -------- | ----------------------------------------- |
| *TypedArrayConstructors/ctors/no-species.js*                      | excluded | `annex-b-typed-array-prototype`           |
| *TypedArray/prototype/resizable-and-fixed-have-same-prototype.js* | excluded | `annex-b-resizable-typed-array-prototype` |
| *TypedArray/out-of-bounds-behaves-like-detached.js*               | excluded | `annex-b-out-of-bounds-prototype-setup`   |

The exclusion reopens on changed source, observation, or replacement
evidence, on an amendment of ADR 0013's optional Annex B policy, or on an
ADR 0019 reopening trigger.

Root owns D3, any UPDATE, outer review, publication, merge, and landed state.
