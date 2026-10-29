Reject uninitialized namespace binding operations
=================================================

Makes module namespace exotic object operations over uninitialized bindings
throw ReferenceError as ECMA-262 requires, so the 5 observed namespace internals
paths can be observed.

The 5 paths below remain unreviewed in the closure ledger.
Root authorized this ready, unlanded owner on 2026-10-27. The saved API
observations used clean source `6aab0fc8`, tree
`d6723be80209aca0fcf0606c5c3e5959f152ad0c`. The table records those
original observations; the repair below does not rewrite them.

| Owned path                                                                                    | Exact observed diagnostic                                                                                                                                                                                                                                                                                                                                                                                                          | Raw result                                                                              |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `test/language/module-code/namespace/internals/enumerate-binding-uninit.js`                   | `test/language/module-code/namespace/internals/enumerate-binding-uninit.js strict disabled failed (1): stdout="" stderr="file:///home/dahlia/.cache/aube/virtual-store/v1/test262@url+d1a1eda3d9511414-f632e209b459265d/node_modules/test262/test/language/module-code/namespace/internals/enumerate-binding-uninit.js:50:7: error[OSEO2001]: Test262Error\nOSEO_THROWN Test262Error\n"`                                           | `/data/m5c-b19-b20-b30-20261027/observation-6aab/continuation/raw/case-55-result.json`  |
| `test/language/module-code/namespace/internals/get-own-property-str-found-uninit.js`          | `test/language/module-code/namespace/internals/get-own-property-str-found-uninit.js strict disabled failed (1): stdout="" stderr="file:///home/dahlia/.cache/aube/virtual-store/v1/test262@url+d1a1eda3d9511414-f632e209b459265d/node_modules/test262/test/language/module-code/namespace/internals/get-own-property-str-found-uninit.js:54:3: error[OSEO2001]: Test262Error: hasOwnProperty: local1\nOSEO_THROWN Test262Error\n"` | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-2-result.json`  |
| `test/language/module-code/namespace/internals/object-hasOwnProperty-binding-uninit.js`       | `test/language/module-code/namespace/internals/object-hasOwnProperty-binding-uninit.js strict disabled failed (1): stdout="" stderr="file:///home/dahlia/.cache/aube/virtual-store/v1/test262@url+d1a1eda3d9511414-f632e209b459265d/node_modules/test262/test/language/module-code/namespace/internals/object-hasOwnProperty-binding-uninit.js:54:3: error[OSEO2001]: Test262Error\nOSEO_THROWN Test262Error\n"`                   | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-19-result.json` |
| `test/language/module-code/namespace/internals/object-keys-binding-uninit.js`                 | `test/language/module-code/namespace/internals/object-keys-binding-uninit.js strict disabled failed (1): stdout="" stderr="file:///home/dahlia/.cache/aube/virtual-store/v1/test262@url+d1a1eda3d9511414-f632e209b459265d/node_modules/test262/test/language/module-code/namespace/internals/object-keys-binding-uninit.js:54:3: error[OSEO2001]: Test262Error\nOSEO_THROWN Test262Error\n"`                                       | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-20-result.json` |
| `test/language/module-code/namespace/internals/object-propertyIsEnumerable-binding-uninit.js` | `test/language/module-code/namespace/internals/object-propertyIsEnumerable-binding-uninit.js strict disabled failed (1): stdout="" stderr="file:///home/dahlia/.cache/aube/virtual-store/v1/test262@url+d1a1eda3d9511414-f632e209b459265d/node_modules/test262/test/language/module-code/namespace/internals/object-propertyIsEnumerable-binding-uninit.js:54:3: error[OSEO2001]: Test262Error\nOSEO_THROWN Test262Error\n"`       | `/data/m5c-b19-b20-b30-20261027/observation-6aab/remaining-904/raw/case-21-result.json` |


ECMA-262 contract
-----------------

10.4.6.5 `[[GetOwnProperty]]` of a module namespace returns `undefined` for
a name outside `[[Exports]]` and otherwise performs `? O.[[Get]](P, O)`
before building its data descriptor, so an uninitialized export binding
throws a `ReferenceError`. Every abstract operation that asks for an own
descriptor inherits that abrupt completion: `HasOwnProperty`,
`Object.prototype.propertyIsEnumerable`, `EnumerableOwnProperties`,
`%ForInIteratorPrototype%.next` over the namespace or an object inheriting
from it, `TestIntegrityLevel`, `CopyDataProperties`,
`ObjectDefineProperties`, `OrdinarySetWithOwnDescriptor` with the namespace
as receiver, the Proxy forwarding and invariant steps that read a target
descriptor, and `SetterThatIgnoresPrototypeProperties`. `[[HasProperty]]`,
`[[OwnPropertyKeys]]`, and `[[Delete]]` read no binding.


Repair
------

The descriptor primitive returns a namespace export's binding cell rather
than its value. The consumers that dereferenced the cell already threw;
the ones that reported only presence or attributes did not.
`oseo_internal_namespace_export_ready` in
*packages/runtime-c/native/runtime\_descriptor.c* performs the binding read
for a namespace export's cell and completes normally for every other
object, key, and namespace metadata property. It is called right after the
own-descriptor query in `oseo_object_has_own`, the Object built-in
descriptor query (`propertyIsEnumerable`, `Object.keys`, `values`,
`entries`, `assign`, `defineProperties`, `create`, and the spread copy),
for-in key filtering, the JSON enumerability query, the `[[Set]]` receiver
lookup, the Iterator prototype setter, and the integrity test. The
integrity test walks the property vector, which holds a namespace's exports
in `[[OwnPropertyKeys]]` order, so `Object.isFrozen` stops at the first
initialized writable export exactly where ECMA-262 does.

The Proxy target descriptor query now replaces any cell-backed value with
the cell's value, which is the namespace `[[Get]]` and its
`ReferenceError`. That query previously handed the binding cell itself to
Proxy callers for every cell-backed target: a forwarded
`Object.getOwnPropertyDescriptor` over a namespace, a global `var` binding,
or a mapped arguments index reported no `value`. The repair is the same
one-function change for all three representations.

`Reflect.set({}, name, value, namespace)` throws the `ReferenceError` for an
uninitialized export, as ECMA-262 requires and as the reviewed
*super-access-to-tdz-binding.js* pass already observed through `super`.
Node.js 24 and Deno return `false` for the `Reflect.set` form; no test
compares that form with the reference hosts.


Evidence
--------

 -  *tests/fixtures/module-namespace-uninitialized/entry.mjs* and
    *later.mjs* probe each operation before and after initialization, for
    local, renamed, indirect, default, var, and `constructor` exports, and
    from a cyclic dependency that evaluates first. The
    *tests/native/scenarios/shard-2.ts* scenario compares native output with
    Node.js and Deno under both specialization policies with collection
    forced at every safepoint.
 -  *tests/native/fixtures/proxy-exotic-object.ts* adds forwarded descriptor
    and value reads over a mapped arguments object and a global `var`
    binding. The fixture is already in both forced-collection lists.
 -  *tests/property/m5-module-namespace-uninitialized.property.test.ts*
    generates one to four let, const, class, var, or function exports and a
    probe position, and checks an independent oracle, Node.js, Deno, and
    both native policies. It reserves the block `0x60009000` through
    `0x600090ff` and uses seed `0x60009000`, 5 ordinary cases, and a
    180-second interrupt limit.
 -  The five owned test262 sources, with *assert.js* and *sta.js* prepended,
    compile and exit 0 natively. This is not a reviewed observation; the
    paths stay unreviewed until their observation batch admits them.

The repair adds no specialization, guard, ABI entry point, intrinsic, or
heap kind.
