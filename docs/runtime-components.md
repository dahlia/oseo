C runtime componentization evidence
===================================

Status
------

This document is the durable record of the completed C runtime
componentization delivered by the retired *PLAN-RCR.md* plan. The
baseline section below is the comparison point taken before the first
extraction; the ownership section records the completed component layout
and is the reference for where new runtime work lands. The baseline is
not a promise of byte-identical object files; it exists so that behavior,
symbol, and size differences introduced by the migration remain
explainable.


Component ownership after extraction
------------------------------------

The runtime input now lists thirty-three reviewed assets in this order:
*oseo\_runtime.h*, *runtime\_internal.h*,
*runtime\_unicode\_tables.h*, *runtime\_core.c*,
*runtime\_memory.c*, *runtime\_binding.c*, *runtime\_string.c*,
*runtime\_string\_match.c*, *runtime\_object.c*, *runtime\_property.c*,
*runtime\_descriptor.c*, *runtime\_array.c*, *runtime\_object\_builtin.c*,
*runtime\_number.c*, *runtime\_array\_buffer.c*, *runtime\_arguments.c*,
*runtime\_enumeration.c*, *runtime\_function.c*, *runtime\_error.c*,
*runtime\_symbol.c*, *runtime\_iterator.c*, *runtime\_generator.c*,
*runtime\_async\_generator.c*, *runtime\_bigint.c*,
*runtime\_primitive.c*, *runtime\_promise.c*,
*runtime\_event\_loop.c*, *runtime\_map.c*,
*runtime\_bigint\_object.c*, *runtime\_data\_view.c*,
*runtime\_regexp.c*, *runtime\_regexp\_matcher.c*, and
*runtime\_math.c*. The M5
named-error-intrinsics
unit added *runtime\_error.c* as the first post-componentization
component, and the symbol, iterator-protocol, generator,
asynchronous-generator, BigInt, string-prototype-match-and-split,
map-intrinsic, BigInt-intrinsic, DataView, RegExp-intrinsic,
RegExp-prototype-and-exec, and Math-namespace units each
added one
component the same
way. The M5b
preparation unit then split the
original *runtime\_object.c* into the eight object-family components
listed above, so the standard built-in objects can be authored in
parallel lanes instead of competing for one translation unit; that
split moved code and promoted eleven file-local helpers to the internal
header without changing behavior. Every addition follows the same
ownership, include, and one-definition rules. No catch-all *runtime.c*
remains, and no temporary forwarding helper was needed at any point in
the migration. Each source compiles as its own translation unit and is
archived in exactly this order. The symbols test in
*packages/runtime-c/tests/symbols.test.ts* enforces the reviewed list,
the include boundaries, and the one-definition rule on every change.

Ownership follows the plan's target layout:

 -  *runtime\_core.c*: results, context lifecycle, diagnostics, call
    limits, frames, root-stack operations, and immediate value
    constructors;
 -  *runtime\_memory.c*: GC-managed heap allocation, the unmanaged
    work-area allocator that shares its deterministic allocation-attempt
    counter without collecting, publication,
    tracing, collection, and destruction; [*PLAN-GC.md*](../PLAN-GC.md)
    owns the planned policy, accounting, slot, descriptor, and collector
    evolution boundaries;
 -  *runtime\_binding.c*: environments, binding cells, module
    namespaces, and the realm's global this value;
 -  *runtime\_string.c*: string values and the string half of a property
    key, meaning allocation, content equality, ASCII name matching,
    canonical array-index recognition, and the own properties a String
    exotic object exposes, together with the `String` constructor,
    %String.prototype%, and the `fromCharCode`, `fromCodePoint`, and
    `raw` statics, together with the prototype case conversions, locale case
    forms, trimming methods, Unicode normalization, and deterministic locale
    comparison. *runtime\_unicode\_tables.h* is its generated, package-private
    view of the pinned Unicode data;
 -  *runtime\_string\_match.c*: the `String.prototype` `match`,
    `matchAll`, `search`, `split`, `replace`, and `replaceAll`
    well-known-symbol dispatch and their String fallback algorithms,
    including the admitted fixed-width regular expression atoms, the
    dedicated RegExp String iterator, and the GetSubstitution replacement
    template both replacement methods share;
 -  *runtime\_object.c*: ordinary object creation and layout, the
    property vector and its growth, own-property lookup and removal,
    cell-backed property recognition, shape identifiers and the
    generated-code property caches, object coercibility checks, and
    `[[SetPrototypeOf]]`;
 -  *runtime\_property.c*: the generic property access paths, meaning
    `[[Get]]` and `[[Set]]` with their `super` forms and `HasOwnProperty`;
 -  *runtime\_descriptor.c*: `[[GetOwnProperty]]`,
    `[[DefineOwnProperty]]` for data and accessor descriptors,
    `[[Delete]]`, the `SameValue` comparison
    `ValidateAndApplyPropertyDescriptor` performs, and the scan-free
    append an exotic object filling a freshly created, empty receiver
    with pairwise distinct keys uses in its place;
 -  *runtime\_array.c*: array exotic behavior, meaning array creation,
    the `length` own property and its truncation rules, canonical index
    keys, monotonic literal and spread accumulation, frozen template
    objects, and the realm-owned `%Array.prototype%` methods;
 -  *runtime\_object\_builtin.c*: the `Object` built-ins and the own-key
    operations they share with object rest and spread, meaning
    `ToPropertyDescriptor` field reads, `CopyDataProperties`, own-key
    ordering, and the `Object.create`, `Object.defineProperty`,
    `Object.defineProperties`, `Object.getOwnPropertyDescriptor`,
    `Object.keys`, and `Object.setPrototypeOf` entry points;
 -  *runtime\_number.c*: the `Number` constructor, branded wrapper state,
    numeric constants, predicate statics, parser statics, the standard
    global constructor property, and the `%Number.prototype%` formatting
    methods `toString`, `toFixed`, `toExponential`, `toPrecision`,
    `toLocaleString`, and `valueOf`, including the exact bignum arithmetic
    their rounding and radix conversion share;
 -  *runtime\_array\_buffer.c*: the `ArrayBuffer` constructor, the Data
    Block one buffer owns, `isView`, the `Symbol.species` accessor, the
    `byteLength`, `detached`, `maxByteLength`, and `resizable` accessors,
    and `resize`, `slice`, `transfer`, and `transferToFixedLength`;
 -  *runtime\_regexp.c*: the `RegExp` constructor, `IsRegExp`,
    `OrdinaryCreateFromConstructor` allocation, `lastIndex`, dynamic pattern
    and flag validation, immutable matcher artifact, `Symbol.species`,
    built-in execution and its match result object, `exec`, `test`,
    `toString`, the `source` and `flags` accessors, the eight individual
    flag accessors, the ahead-of-time literal entry point with the
    realm-local artifact cache its descriptors key, and the explicit
    symbol-method boundary;
 -  *runtime\_regexp\_matcher.c*: the generic matcher, meaning the
    pattern compiler that lowers one validated pattern into an owned
    instruction program over a register file and the executor that runs
    that program with an explicit backtrack stack and undo trail; it owns
    the runtime's choice order, capture visibility, assertion and
    lookaround behavior, backreference resolution, quantifier priority,
    empty-progress failure, UTF-16 and code-point traversal, ignore-case
    closure, and the reviewed instruction, register, step, backtrack, and
    trail boundaries;
 -  *runtime\_math.c*: the `Math` namespace object, its eight value
    properties, its `Symbol.toStringTag`, the thirty-six function
    properties of 21.3.2, and the realm's `Math.random` draw, whose
    xorshift128+ state *runtime\_core.c* seeds from the realm's
    initialization ordinal. It owns no numeric conversion of its own:
    `ToNumber`, `ToUint32`, and Number::exponentiate stay with
    *runtime\_primitive.c*;
 -  *runtime\_arguments.c*: the unmapped arguments object 10.2.4 creates,
    the mapped object 10.4.4 creates from a simple parameter list, the
    `@@iterator` both shapes define, and the realm's single
    `%ThrowTypeError%` intrinsic their `callee` accessor reports;
 -  *runtime\_enumeration.c*: `EnumerateObjectProperties`, meaning the
    for-in key collection over one prototype chain and the reachability
    rule each step applies;
 -  *runtime\_function.c*: function creation, callable metadata,
    construction, and generic dispatch;
 -  *runtime\_error.c*: the named error intrinsics, their lazily created
    constructor and prototype pairs, typed runtime error creation, the
    shared `Error.prototype.toString`, and unhandled-throw rendering;
 -  *runtime\_symbol.c*: symbol values, the lazily created `Symbol`
    intrinsic, the well-known symbols, and descriptive symbol text;
 -  *runtime\_iterator.c*: the synchronous iterator protocol
    (GetIterator, IteratorStep, IteratorValue, IteratorClose), the
    first-class array iterator, and its realm-owned prototype methods;
 -  *runtime\_generator.c*: the suspended body frame both generator kinds
    share, its collector-traced root slots and saved completion records,
    and the `%GeneratorPrototype%` resumptions that drive a synchronous
    generator;
 -  *runtime\_async\_generator.c*: the `AsyncGeneratorRequest` queue, the
    driver that runs one request at a time, and the two reactions that
    resume a body parked on an awaited operand;
 -  *runtime\_bigint.c*: exact BigInt primitives, their limb
    representation, arithmetic and bitwise operators, comparison, and
    string conversion in both directions;
 -  *runtime\_primitive.c*: coercions including the generic
    `ToPrimitive`, arithmetic, comparison, string
    conversion, and console output;
 -  *runtime\_promise.c*: the `%Promise%` intrinsic and its statics,
    promises, capabilities, reactions, thenable jobs, combinators,
    rejection tracking, and job draining;
 -  *runtime\_event\_loop.c*: timer queues, task
    checkpoints, top-level await progress, and shutdown; timer delay
    coercion goes through the shared primitive conversions;
 -  *runtime\_map.c*: the `%Map%` intrinsic and its statics, keyed
    collection storage with SameValueZero identity, insertion order, and
    in-place tombstone deletion, its realm-owned prototype methods, and
    `%MapIteratorPrototype%`;
 -  *runtime\_bigint\_object.c*: the callable `%BigInt%` intrinsic,
    `BigInt.asIntN` and `BigInt.asUintN`, `%BigInt.prototype%` and its
    `toString`, `toLocaleString`, and `valueOf` methods, the
    `thisBigIntValue` brand check, and the `ToBigInt` and `NumberToBigInt`
    conversions. It reads no limb: the representation stays behind the
    private operations *runtime\_bigint.c* exports;
 -  *runtime\_data\_view.c*: the `%DataView%` intrinsic,
    `%DataView.prototype%` with its `buffer`, `byteLength`, and
    `byteOffset` accessors, and the eleven `get` and eleven `set`
    element accessors with their `NumericToRawBytes` and
    `RawBytesToNumeric` conversions and byte-order handling. It owns no
    Data Block: it holds only its buffer's value, rereads that buffer's
    pointer, byte length, and detached state on every access, and never
    allocates, resizes, or releases a block.

The iterator protocol operations `oseo_iterator_get`, `oseo_iterator_next`,
and `oseo_iterator_close` are generated-code ABI entry points declared in
*oseo\_runtime.h*. Promise combinators share those public operations.
Array literal spread also shares iterator get and next, then calls the
`oseo_array_append` and `oseo_array_append_hole` generated-code ABI operations
owned by *runtime\_array.c*. The append operations preserve monotonic own
indexed-property accumulation and keep allocation policy outside the backend.
Call and constructor argument spread share iterator get and next without
iterator close, then use the `oseo_argument_list_create`,
`oseo_argument_list_append`, and `oseo_argument_list_view` ABI operations owned
by *runtime\_function.c*. The GC-traced private list keeps dynamic invocation
arguments rooted without exposing a JavaScript object or moving process
execution into the backend.
Array binding declarations reuse iterator get, next, and close without
adding a runtime ABI entry point. Generated control flow owns the per-pattern
done state and conditional cleanup, and rest targets reuse array append.
Function rest parameters also reuse array creation and append without changing
the generic function call ABI. Generated code copies the unbound suffix while
the caller retains the argument vector and the function environment roots the
fresh array.
Object binding declarations use the `oseo_require_object_coercible`
generated-code ABI operation owned by *runtime\_object.c*, followed by the
existing property-key conversion and property-read operations. The compiler
owns recursive target initialization and default selection.
Property deletion uses the separate
`oseo_require_delete_object_coercible` operation after key-expression
evaluation and before property-key conversion. The separate entry point keeps
the delete-specific nullish error while preserving object-binding diagnostics.
Catch binding patterns reuse the same iterator, coercibility, property-read,
array-append, and object-rest operations after generated code captures the
pending thrown value. They add no runtime ABI entry point; compiler-owned
cleanup regions route a pattern failure around the catch body and through an
enclosing `finally`.
Synchronous `for-of` declaration patterns also add no runtime ABI entry point.
They initialize or write the same compiler-owned binding leaves, while nested
array patterns close before the existing outer `for-of` cleanup resumes.
Assignment-pattern heads likewise reuse the existing-target path without a new
runtime operation. Checked identifier and member writes retain the same
inner-before-outer iterator cleanup.
Standalone destructuring assignment likewise adds no runtime ABI entry point.
It writes existing identifier cells through the declaration paths and preserves
the original right-hand result. Array patterns retain conditional iterator
close, while object patterns retain coercibility, property-read, and rest-copy
operations.
Compound assignment also adds no runtime ABI entry point. Generated code
retains one checked binding read or one object and converted property key, then
reuses the existing binary, property-read, and checked write operations.
Logical forms branch before the right operand and write, so their short path
introduces no hidden runtime call.
Update expressions likewise add no runtime ABI entry point. Generated code
reuses Number coercion, arithmetic, property-key conversion, property reads,
and checked binding or property writes. A member step retains one raw key value
and invokes the existing coercibility check before converting separately for
its read and write.
Regular expression literals add one generated-code ABI entry point,
`oseo_regexp_literal`, owned by *runtime\_regexp.c*. Its argument is an
`OseoRegExpLiteral` descriptor of generated data: the written pattern and flag
text, the normalized flag mask, and the compiled matcher program the build
produced, whose instruction, set, repetition, capture, name, and
canonicalization layout *oseo\_runtime.h* declares because the build now
writes it. The entry point parses and compiles nothing; it takes the realm's
one immutable artifact for that descriptor, from a realm-local table
addressed by the descriptor's own address, and returns a fresh RegExp object
over it whose own `lastIndex` starts at zero. The table reserves the slot
through the work-area allocator before the artifact exists, so the
allocation-attempt sweep covers its growth and the insertion afterwards
cannot fail.
Deciding whether an artifact owns its program is what keeps the collector from
freeing generated data: an artifact built from a dynamic pattern owns its
program and releases it, while an artifact over a literal descriptor borrows
one.

### Internal helpers

One hundred and forty-four helpers cross a translation-unit
boundary. Each uses
the `oseo_internal_` prefix, has exactly one declaration in
*runtime\_internal.h*, and is defined in its owning unit:

| Internal helper                                     | Defined in                    |
| --------------------------------------------------- | ----------------------------- |
| `oseo_internal_promise_builtin_dispatch`            | *runtime\_promise.c*          |
| `oseo_internal_error_builtin_dispatch`              | *runtime\_error.c*            |
| `oseo_internal_symbol_builtin_dispatch`             | *runtime\_symbol.c*           |
| `oseo_internal_iterator_builtin_dispatch`           | *runtime\_iterator.c*         |
| `oseo_internal_generator_builtin_dispatch`          | *runtime\_generator.c*        |
| `oseo_internal_async_generator_builtin_dispatch`    | *runtime\_async\_generator.c* |
| `oseo_internal_array_builtin_dispatch`              | *runtime\_array.c*            |
| `oseo_internal_arguments_builtin_dispatch`          | *runtime\_arguments.c*        |
| `oseo_internal_object_builtin_dispatch`             | *runtime\_object\_builtin.c*  |
| `oseo_internal_function_builtin_dispatch`           | *runtime\_function.c*         |
| `oseo_internal_number_builtin_dispatch`             | *runtime\_number.c*           |
| `oseo_internal_number_intrinsic`                    | *runtime\_number.c*           |
| `oseo_internal_install_number_global`               | *runtime\_number.c*           |
| `oseo_internal_math_builtin_dispatch`               | *runtime\_math.c*             |
| `oseo_internal_math_intrinsic`                      | *runtime\_math.c*             |
| `oseo_internal_install_math_global`                 | *runtime\_math.c*             |
| `oseo_internal_install_object_global`               | *runtime\_object\_builtin.c*  |
| `oseo_internal_allocate_heap_bytes`                 | *runtime\_memory.c*           |
| `oseo_internal_error_construct`                     | *runtime\_error.c*            |
| `oseo_internal_error_prototype`                     | *runtime\_error.c*            |
| `oseo_internal_error_to_string`                     | *runtime\_error.c*            |
| `oseo_internal_throw_error`                         | *runtime\_error.c*            |
| `oseo_internal_publish_heap`                        | *runtime\_memory.c*           |
| `oseo_internal_allocate_string`                     | *runtime\_string.c*           |
| `oseo_internal_ascii_string`                        | *runtime\_string.c*           |
| `oseo_internal_string_equal`                        | *runtime\_string.c*           |
| `oseo_internal_property_key_equal`                  | *runtime\_string.c*           |
| `oseo_internal_array_index`                         | *runtime\_string.c*           |
| `oseo_internal_string_own_property`                 | *runtime\_string.c*           |
| `oseo_internal_string_data`                         | *runtime\_string.c*           |
| `oseo_internal_string_wrapper_properties`           | *runtime\_string.c*           |
| `oseo_internal_string_builtin_dispatch`             | *runtime\_string.c*           |
| `oseo_internal_string_intrinsic`                    | *runtime\_string.c*           |
| `oseo_internal_install_string_global`               | *runtime\_string.c*           |
| `oseo_internal_bigint_binary`                       | *runtime\_bigint.c*           |
| `oseo_internal_bigint_negate`                       | *runtime\_bigint.c*           |
| `oseo_internal_bigint_not`                          | *runtime\_bigint.c*           |
| `oseo_internal_bigint_string`                       | *runtime\_bigint.c*           |
| `oseo_internal_string_to_bigint`                    | *runtime\_bigint.c*           |
| `oseo_internal_bigint_compare`                      | *runtime\_bigint.c*           |
| `oseo_internal_bigint_compare_number`               | *runtime\_bigint.c*           |
| `oseo_internal_bigint_equal`                        | *runtime\_bigint.c*           |
| `oseo_internal_bigint_is_zero`                      | *runtime\_bigint.c*           |
| `oseo_internal_bigint_to_number`                    | *runtime\_bigint.c*           |
| `oseo_internal_integer_digits_to_number`            | *runtime\_bigint.c*           |
| `oseo_internal_bigint_from_integral_number`         | *runtime\_bigint.c*           |
| `oseo_internal_bigint_radix_string`                 | *runtime\_bigint.c*           |
| `oseo_internal_bigint_as_width`                     | *runtime\_bigint.c*           |
| `oseo_internal_bigint_builtin_dispatch`             | *runtime\_bigint\_object.c*   |
| `oseo_internal_to_bigint`                           | *runtime\_bigint\_object.c*   |
| `oseo_internal_bigint_intrinsic`                    | *runtime\_bigint\_object.c*   |
| `oseo_internal_install_bigint_global`               | *runtime\_bigint\_object.c*   |
| `oseo_internal_bigint_to_raw_uint64`                | *runtime\_bigint.c*           |
| `oseo_internal_bigint_from_uint64`                  | *runtime\_bigint.c*           |
| `oseo_internal_to_index`                            | *runtime\_primitive.c*        |
| `oseo_internal_data_view_builtin_dispatch`          | *runtime\_data\_view.c*       |
| `oseo_internal_data_view_intrinsic`                 | *runtime\_data\_view.c*       |
| `oseo_internal_install_data_view_global`            | *runtime\_data\_view.c*       |
| `oseo_internal_is_regexp`                           | *runtime\_regexp.c*           |
| `oseo_internal_regexp_builtin_dispatch`             | *runtime\_regexp.c*           |
| `oseo_internal_regexp_intrinsic`                    | *runtime\_regexp.c*           |
| `oseo_internal_install_regexp_global`               | *runtime\_regexp.c*           |
| `oseo_internal_allocate_work_bytes`                 | *runtime\_memory.c*           |
| `oseo_internal_reallocate_work_bytes`               | *runtime\_memory.c*           |
| `oseo_internal_regexp_program_build`                | *runtime\_regexp\_matcher.c*  |
| `oseo_internal_regexp_program_release`              | *runtime\_regexp\_matcher.c*  |
| `oseo_internal_regexp_program_search`               | *runtime\_regexp\_matcher.c*  |
| `oseo_internal_own_descriptor`                      | *runtime\_descriptor.c*       |
| `oseo_internal_append_own_property`                 | *runtime\_descriptor.c*       |
| `oseo_internal_own_property_index`                  | *runtime\_object.c*           |
| `oseo_internal_remove_property`                     | *runtime\_object.c*           |
| `oseo_internal_grow_properties`                     | *runtime\_object.c*           |
| `oseo_internal_cell_backed_property`                | *runtime\_object.c*           |
| `oseo_internal_require_property_key`                | *runtime\_property.c*         |
| `oseo_internal_set_array_length`                    | *runtime\_array.c*            |
| `oseo_internal_promise_aggregate_settle`            | *runtime\_promise.c*          |
| `oseo_internal_promise_finally_continuation_create` | *runtime\_promise.c*          |
| `oseo_internal_promise_finally_invoke`              | *runtime\_promise.c*          |
| `oseo_internal_promise_invoke_then`                 | *runtime\_promise.c*          |
| `oseo_internal_promise_create`                      | *runtime\_promise.c*          |
| `oseo_internal_async_generator_method`              | *runtime\_async\_generator.c* |
| `oseo_internal_generator_complete`                  | *runtime\_generator.c*        |
| `oseo_internal_promise_method_function`             | *runtime\_promise.c*          |
| `oseo_internal_string_is_ascii`                     | *runtime\_string.c*           |
| `oseo_internal_to_number`                           | *runtime\_primitive.c*        |
| `oseo_internal_number_exponentiate`                 | *runtime\_primitive.c*        |
| `oseo_internal_number_to_uint32`                    | *runtime\_primitive.c*        |
| `oseo_internal_to_primitive`                        | *runtime\_primitive.c*        |
| `oseo_internal_to_object`                           | *runtime\_object\_builtin.c*  |
| `oseo_internal_to_object_for_property`              | *runtime\_object\_builtin.c*  |
| `oseo_internal_install_primitive_wrapper_methods`   | *runtime\_object\_builtin.c*  |
| `oseo_internal_symbol_create`                       | *runtime\_symbol.c*           |
| `oseo_internal_symbol_text`                         | *runtime\_symbol.c*           |
| `oseo_internal_symbol_name`                         | *runtime\_symbol.c*           |
| `oseo_internal_well_known_symbol`                   | *runtime\_symbol.c*           |
| `oseo_internal_generator_prototype`                 | *runtime\_generator.c*        |
| `oseo_internal_generator_function_intrinsic`        | *runtime\_generator.c*        |
| `oseo_internal_async_function_intrinsic`            | *runtime\_generator.c*        |
| `oseo_internal_generator_created`                   | *runtime\_generator.c*        |
| `oseo_internal_async_generator_prototype`           | *runtime\_generator.c*        |
| `oseo_internal_async_generator_intrinsic`           | *runtime\_generator.c*        |
| `oseo_internal_async_generator_awaited`             | *runtime\_async\_generator.c* |
| `oseo_internal_iterator_result`                     | *runtime\_iterator.c*         |
| `oseo_internal_array_values`                        | *runtime\_iterator.c*         |
| `oseo_internal_array_iterator_next`                 | *runtime\_iterator.c*         |
| `oseo_internal_iterator_key_matches`                | *runtime\_iterator.c*         |
| `oseo_internal_iterator_method`                     | *runtime\_iterator.c*         |
| `oseo_internal_async_from_sync_fulfilled`           | *runtime\_iterator.c*         |
| `oseo_internal_async_from_sync_rejected`            | *runtime\_iterator.c*         |
| `oseo_internal_throw_type_error_function`           | *runtime\_arguments.c*        |
| `oseo_internal_object_prototype`                    | *runtime\_object\_builtin.c*  |
| `oseo_internal_intrinsic`                           | *runtime\_function.c*         |
| `oseo_internal_promise_prototype`                   | *runtime\_promise.c*          |
| `oseo_internal_promise_intrinsic`                   | *runtime\_promise.c*          |
| `oseo_internal_install_promise_global`              | *runtime\_promise.c*          |
| `oseo_internal_array_prototype`                     | *runtime\_array.c*            |
| `oseo_internal_array_iterator_prototype`            | *runtime\_iterator.c*         |
| `oseo_internal_same_value`                          | *runtime\_descriptor.c*       |
| `oseo_internal_ordinary_has_instance`               | *runtime\_function.c*         |
| `oseo_internal_array_push_function`                 | *runtime\_array.c*            |
| `oseo_internal_array_push`                          | *runtime\_array.c*            |
| `oseo_internal_value_string`                        | *runtime\_primitive.c*        |
| `oseo_internal_number_text`                         | *runtime\_primitive.c*        |
| `oseo_internal_number_shortest_digits`              | *runtime\_primitive.c*        |
| `oseo_internal_jobs_drain_until`                    | *runtime\_promise.c*          |
| `oseo_internal_jobs_reached_promise`                | *runtime\_promise.c*          |
| `oseo_internal_await_step`                          | *runtime\_event\_loop.c*      |
| `oseo_internal_async_iterator_key_matches`          | *runtime\_iterator.c*         |
| `oseo_internal_validate_string_length`              | *runtime\_string.c*           |
| `oseo_internal_string_protocol_dispatch`            | *runtime\_string\_match.c*    |
| `oseo_internal_regexp_string_iterator_prototype`    | *runtime\_string\_match.c*    |
| `oseo_internal_array_join_element_string`           | *runtime\_primitive.c*        |
| `oseo_internal_map_builtin_dispatch`                | *runtime\_map.c*              |
| `oseo_internal_map_prototype`                       | *runtime\_map.c*              |
| `oseo_internal_map_intrinsic`                       | *runtime\_map.c*              |
| `oseo_internal_install_map_global`                  | *runtime\_map.c*              |
| `oseo_internal_same_value_zero`                     | *runtime\_descriptor.c*       |
| `oseo_internal_array_intrinsic`                     | *runtime\_array.c*            |
| `oseo_internal_install_array_global`                | *runtime\_array.c*            |
| `oseo_internal_to_array_length`                     | *runtime\_array.c*            |
| `oseo_internal_array_buffer_builtin_dispatch`       | *runtime\_array\_buffer.c*    |
| `oseo_internal_array_buffer_intrinsic`              | *runtime\_array\_buffer.c*    |
| `oseo_internal_array_buffer_release`                | *runtime\_array\_buffer.c*    |
| `oseo_internal_install_array_buffer_global`         | *runtime\_array\_buffer.c*    |
| `oseo_internal_object_define_data`                  | *runtime\_descriptor.c*       |
| `oseo_internal_virtual_string_iterator_descriptor`  | *runtime\_descriptor.c*       |
| `oseo_internal_primitive_wrapper_prototype`         | *runtime\_object\_builtin.c*  |

### Documented component cycles

The extraction confirmed these irreducible cycles. Each is accepted as a
pair of named interfaces rather than removed, because both directions
express observable language semantics. Where a cycle names the object
side, it means the object family as a whole: *runtime\_string.c*,
*runtime\_object.c*, *runtime\_property.c*, *runtime\_descriptor.c*,
*runtime\_array.c*, *runtime\_object\_builtin.c*, *runtime\_arguments.c*,
and *runtime\_enumeration.c*.

 -  property access to promise: `oseo_object_get`, owned by
    *runtime\_property.c*, materializes `then`, `catch`, and `finally`
    through `oseo_internal_promise_method_function`, while promise code
    builds ordinary objects through public object operations;
 -  function to promise: the built-in code-range table delegates the
    promise range to `oseo_internal_promise_builtin_dispatch`, while promise
    code re-enters callables through `oseo_call_function`;
 -  object and primitive: array-length semantics in *runtime\_array.c*
    and descriptor semantics in *runtime\_descriptor.c* call
    `oseo_internal_to_number`, while coercions and operators use public
    object reads and `oseo_internal_own_descriptor`;
 -  binding and object: module-namespace creation builds its backing
    object through public object operations, the global this value a
    nullish receiver resolves to is one ordinary object created through
    `oseo_object_literal_create` whose var-scoped Script properties are
    defined through `oseo_object_define`, and object reads, writes,
    descriptor queries, and definitions resolve both a module-namespace
    entry and a global-object binding through the cell the property
    stores;
 -  error and the throwing components: core, binding, object, function,
    primitive, promise, and event-loop semantics create typed catchable
    errors through `oseo_internal_throw_error`, while error-intrinsic
    construction builds ordinary objects, strings, and internal
    functions through the public object and function operations;
 -  function and symbol: function creation applies `SetFunctionName`
    to a symbol key through `oseo_internal_symbol_name`, while the
    `Symbol` intrinsic and its well-known symbols are built through the
    public function and object operations;
 -  property access and iterator: `oseo_object_get` materializes an
    array's `Symbol.iterator` and an array iterator's `next` through
    `oseo_internal_iterator_method`, while the iterator component reads
    elements, reads and calls `next` and `return`, and reads the
    well-known iterator symbol through public object, symbol, and
    function operations.

The event-loop component is a one-way dependent: timer turns drain jobs
through `oseo_internal_jobs_drain_until` and
`oseo_internal_jobs_reached_promise`, and `await` and timers construct
promises through promise-owned entry points, while no promise code calls
into the event loop.

### Intrinsic graph root evidence

M5b node `intrinsic-graph-root` gives `OseoContext` one
`intrinsics[OSEO_INTRINSIC_COUNT]` table. *runtime\_function.c* owns root
materialization and dispatches component slots to their existing builders;
*runtime\_memory.c* traces the table as one permanent realm root. Ordinary
objects and functions now inherit from the materialized `%Object.prototype%`
and callable `%Function.prototype%`. Arrays, promises, iterators, generators,
errors, symbols, and asynchronous generators expose their existing methods and
constructors through ordinary prototype objects instead of name comparison in
*runtime\_property.c*.

The public context layout and intrinsic accessor move `abiVersion` to `m5-46`.
The structural runtime tests reject a return of `default_intrinsics` or
`OseoVirtualProperty`; fixed and generated native evidence covers method
identity, prototype replacement, both specialization policies, and forced
collection. The node owns no test262 inventory roots and changes no reviewed
compatibility count.

### Object prototype evidence

M5b node `object-prototype` populates the existing realm-owned
`%Object.prototype%` with `hasOwnProperty`, `isPrototypeOf`,
`propertyIsEnumerable`, `toString`, `toLocaleString`, `valueOf`, and its
`constructor` link. *runtime\_object\_builtin.c* owns the methods and its
reserved built-in code range; ordinary lookup continues to use the shared
object and property components. The later `object-constructor` node still owns
callable constructor behavior and primitive wrapper objects.

The public intrinsic table expands for the constructor and methods, moving
`abiVersion` to `m5-47`. Fixed and generated native differential evidence
covers descriptors, prototype identity, both specialization policies,
deliberate shape-guard misses, and forced collection. The node reviews only
its declared `%Object.prototype%` test262 inventory root.

M5b node `generic-string-coercion` connects that materialized method to the
conversion. *runtime\_primitive.c* keeps ownership of `ToPrimitive` and
retires the two private text substitutes it selected by intrinsic prototype
identity: a virtual receiver-sensitive tag text and a function-and-promise
unsupported diagnostic. OrdinaryToPrimitive now reads `valueOf` and
`toString` with the ordinary property lookup and calls whichever function it
finds, so `%Object.prototype.toString%` composes every tag from one owner
and a deleted or replaced default is observable. Array text keeps its
deferred conversion, which the Array prototype nodes own because it honors a
user `join` and shares the conversion cycle stack.

Fixed and generated native differential evidence covers `@@toPrimitive`
dispatch and its rejections, hint order and fallthrough, `@@toStringTag`
in own, inherited, non-string, getter, and shadowing forms, every builtinTag
receiver, deleted and replaced default methods, both specialization
policies, deliberate shape-guard misses, generic fallback, and collection
forced at every safepoint. The node adds no component, no internal helper,
and no generated-code entry point, and moves `abiVersion` to `m5-79`.

### Object constructor evidence

M5b node `object-constructor` makes the realm-owned `Object` identity callable
and constructible in *runtime\_object\_builtin.c*. The same component owns
`ToObject`, primitive wrapper state and String wrapper properties,
`Object.is`, `Object.getPrototypeOf`, and `Object.setPrototypeOf`. Wrapper
objects retain their primitive values in traced ordinary-object fields and
reach stable realm-owned primitive prototypes.

The public intrinsic table and ordinary-object layout expand, moving
`abiVersion` to `m5-51`. Fixed and generated native differential evidence
covers both specialization policies, false hints, deliberate guard misses,
generic fallback, global `Object` replacement, and collection forced at every
safepoint. The node reviews all five declared test262 inventory roots.

### Object define-property evidence

M5b node `object-define-property` admits `Object.defineProperty` over the
shared property-key and descriptor components. The Object built-in component
orders target validation, property-key coercion, and descriptor conversion.
The descriptor component owns attribute defaults, data and accessor
compatibility, mutation, aliases, and module-namespace restrictions.

The completed semantic checkpoint moves `abiVersion` to `m5-52` without a
public layout change. Fixed and generated native differential evidence covers
both specialization policies, false hints, generic fallback, deliberate
invalid and abrupt descriptors, and collection forced at every safepoint. The
node reviews only its declared `Object.defineProperty` test262 inventory root.

### Promise intrinsic evidence

M5b node `promise-intrinsic` materializes `%Promise%` in *runtime\_promise.c*.
The component keeps its existing ownership of promises, reactions, thenable
jobs, and job draining, and gains the constructor, the prototype links, the
`Symbol.species` accessor, the `resolve`, `reject`, `withResolvers`, and `try`
statics, and the PromiseCapability record that `then`, `finally`, and the two
existing combinators build from SpeciesConstructor or their `this` value. The
binding component installs the global property beside the `Object` and `Number`
ones through `oseo_internal_install_promise_global`.

The materialized value replaces three generated-code entry points, so
`abiVersion` moves to `m5-53` and `oseo_promise_construct`,
`oseo_promise_race`, and `oseo_promise_reject` leave the public header. Fixed
and generated native differential evidence covers both specialization
policies, false hints, deliberate guard misses, generic fallback, subclass
capabilities, foreign capability constructors, and collection forced at every
safepoint. The node reviews the seven declared `Promise` inventory roots and
promotes no path outside them.

### Promise combinator evidence

M5b node `promise-all-and-race` completes the two existing combinators in
*runtime\_promise.c*. They read the receiver's `resolve` once, retain the
constructor and method across iterator safepoints, and use the shared iterator
component for every acquisition, step, and conditional close. `Promise.all`
owns per-index fulfillment state and preserves input order, while both
combinators share the callback identities their algorithms require.

The completed semantic checkpoint moves `abiVersion` to `m5-67` without a
public layout or generated-code entry-point change. Fixed and generated native
differential evidence covers both specialization policies, false hints,
generic fallback, deliberate guard misses, subclass and species behavior, and
collection forced at every safepoint. The node reviews only its declared
`Promise.all` and `Promise.race` test262 inventory roots.

### Object descriptor query evidence

M5b node `object-descriptor-queries` completes the reporting half of the
descriptor checkpoint in *runtime\_object\_builtin.c*. One
FromPropertyDescriptor body now serves both
`Object.getOwnPropertyDescriptor` and the new
`Object.getOwnPropertyDescriptors`, and the same component owns the ordinary
own-key walk the plural query needs, including the array `length` and
function `prototype` the property vector does not store. The descriptor
component keeps its ownership of `[[GetOwnProperty]]`, so neither query adds
a second reading path.

Reporting the unstored `prototype` in creation order needs one shared
`OseoFunction` field rather than a new call between components, the way
`prototype_writable` already works. *runtime\_function.c* records the
position MakeConstructor gives it, *runtime\_descriptor.c* moves that
position when `[[Delete]]` removes one of the properties created ahead of
it, and *runtime\_object\_builtin.c* only reads it.

The completed semantic checkpoint moves `abiVersion` to `m5-54` without a
public layout change. Fixed and generated native differential evidence covers
both specialization policies, false hints, deliberate guard misses, generic
fallback, primitive conversion targets, symbol keys, and collection forced at
every safepoint. The node reviews its two declared test262 inventory roots
and promotes no path outside them.

### ArrayBuffer evidence

M5b node `array-buffer` adds *runtime\_array\_buffer.c* as the runtime's
twenty-fifth reviewed asset and `OSEO_HEAP_ARRAY_BUFFER` as its eighteenth
heap kind. The record embeds the ordinary object layout, so property access,
descriptors, and prototype operations reach it through the paths that already
exist; only tracing, destruction, and the object predicate learned the new
kind.

`[[ArrayBufferData]]` is the first runtime state that is host memory rather
than traced values, so its ownership is stated once and enforced in one
place. Exactly one buffer owns each Data Block.
`oseo_internal_array_buffer_release` frees the block and leaves the record
detached, and it is the only release path: *runtime\_memory.c* calls it when
the collector destroys a buffer, and the detaching half of
ArrayBufferCopyAndDetach calls it while the buffer stays alive. Because the
release detaches, a block a transfer already gave up cannot be freed a second
time. No operation copies a block pointer between records: a resizable buffer
reserves its whole maximum at allocation so `resize` never reallocates, and
both transfers and `slice` allocate a second block and copy into it. Both
native execution targets build under the address and undefined-behavior
sanitizers, so the forced-collection fixture and the generated property suite
execute these rules under them.

The new component moves `abiVersion` to `m5-55` without a public layout
change. Fixed and generated native differential evidence covers both
specialization policies, false hints, deliberate guard misses, generic
fallback, resize, detach, transfer ownership, species allocation, and
collection forced at every safepoint. The node reviews its one declared
test262 inventory root and promotes no path outside it.

### Object integrity-level evidence

M5b node `object-integrity-levels` exposes the extensibility flag reserved by
the intrinsic graph root through the six Object integrity statics.
SetIntegrityLevel applies each stored property transition through the shared
descriptor component, preserving ordinary and exotic compatibility rules.
TestIntegrityLevel also inspects array `length` and function `prototype`, the
two admitted own data properties stored outside the property vector.

The completed operation pair moves `abiVersion` to `m5-56` without a public
layout change. Fixed and generated native differential evidence covers both
specialization policies, false hints, deliberate guard hits and misses,
generic fallback, ordinary and exotic targets, primitives, and collection
forced at every safepoint. The node reviews its six declared test262 inventory
roots and promotes only previously reviewed cases whose extensibility
prerequisite it satisfies.

### Object define-properties evidence

M5b node `object-define-properties` adds `Object.defineProperties` to
*runtime\_object\_builtin.c* over the components it already composes. One
shared ToPropertyDescriptor body now serves both define entry points, one
shared DefinePropertyOrThrow body applies every converted descriptor
through the descriptor component, and the plural entry point reuses the
ordinary own-key walk the descriptor-reporting query owns. The collection
pass roots every collected key and descriptor field, completes before the
first definition, and applies the collected descriptors in own-key order,
so an abrupt collection leaves the target untouched while an abrupt
definition keeps its predecessors.

The completed collection checkpoint moves `abiVersion` to `m5-60` without
a public layout change. Fixed and generated native differential evidence
covers both specialization policies, false hints, deliberate guard
misses, generic fallback, abrupt collection and definition orders,
namespace sources and targets, and collection forced at every safepoint.
The node reviews only its declared `Object.defineProperties` test262
inventory root.

### String intrinsic evidence

M5b node `string-intrinsic` materializes `%String%` in *runtime\_string.c*.
The component keeps its existing ownership of string values and property-key
comparison, and gains the constructor, %String.prototype%, the exotic own
properties every String wrapper exposes, and the `fromCharCode`,
`fromCodePoint`, and `raw` statics. The definition of those own properties
moves here from *runtime\_object\_builtin.c*, so ToObject and `new String`
build one shape from one owner. The binding component installs the global
property beside the `Object`, `Number`, and `Promise` ones through
`oseo_internal_install_string_global`.

The materialized value adds no generated-code entry point; `abiVersion` moves
to `m5-62` for the expanded intrinsic table. `Object.prototype.toString` reads
the `[[StringData]]` brand in the Object statics component, so it reports
`[object String]` for a wrapper. Fixed and
generated native differential evidence covers both specialization policies,
false hints, deliberate guard misses, generic fallback, lone surrogates,
astral code points, coercion order, and collection forced at every safepoint.
The node reviews 145 of the 150 paths under its four declared inventory roots.

M5b node `string-prototype-access` keeps ownership in *runtime\_string.c* and
adds ordinary `at`, `charAt`, `charCodeAt`, `codePointAt`, `toString`, and
`valueOf` functions to the materialized prototype. Its existing `constructor`
property continues to link to the realm-owned `String` constructor. The four
access methods are generic over every non-nullish receiver and preserve
receiver-before-position coercion, `ToString`, `ToIntegerOrInfinity`, and
UTF-16 indexing. `toString` and `valueOf` instead accept only String primitives
and objects branded with `[[StringData]]`, including `%String.prototype%`.

The `concat`, `lastIndexOf`, `localeCompare`, `match`, `replace`, `search`,
`slice`, `split`, `substring`, `toLocaleLowerCase`, `toLocaleUpperCase`,
`toLowerCase`, `toUpperCase`, and `trim` methods remain source-located M5b
boundaries. Fixed and generated native differential evidence covers generic
and branded receivers, coercion order, abrupt conversions, UTF-16 edge cases,
both specialization policies, generic fallback, and collection at every
safepoint. The node reviews all 105 paths under its declared inventory roots,
with 89 passes and 16 explicit prerequisite boundaries. It adds no
generated-code entry point and moves `abiVersion` to `m5-63`.

M5b node `array-prototype-iterative` keeps ownership in *runtime\_array.c* and
adds ordinary `every`, `forEach`, and `some` functions to the materialized
`%Array.prototype%`. The component shares one snapshot-length loop that
performs HasProperty and Get at each visited index, calls the validated
callback with the value, index, and converted receiver, and preserves the
specified early result for `every` and `some`. The loop remains generic over
ordinary array-like and primitive receivers, so deletion, creation,
inheritance, and length mutation are observed at the specified step.

Fixed and generated native differential evidence covers callback validation
and order, sparse and inherited entries, mutation during iteration, primitive
and ordinary array-like receivers, abrupt completion, both specialization
policies, generic fallback, and collection at every safepoint. The node adds no
generated-code entry point and moves `abiVersion` to `m5-64`.

M5b node `string-prototype-search-and-slice` keeps the same component ownership
and adds ordinary `concat`, `indexOf`, `lastIndexOf`, `includes`, `startsWith`,
`endsWith`, `slice`, and `substring` functions. Receiver conversion precedes
later operands, `concat` converts arguments in order, search-string conversion
precedes position conversion, and the three predicate methods perform
`IsRegExp` first. Matching and extraction operate on UTF-16 code units. The
search methods clamp their converted positions, while `slice` applies relative
negative indices and `substring` clamps and swaps its endpoints.

The `match`, `replace`, `search`, and `split` methods remain source-located M5b
boundaries at this checkpoint. Fixed and generated native differential
evidence covers generic receivers, `@@match`, conversion order, abrupt
conversions, UTF-16 edge cases, both specialization policies, generic
fallback, and collection at every safepoint. The node reviews all 253 paths
under its declared inventory roots, with 217 passes and 36 explicit
prerequisite boundaries. It adds no generated-code entry point and moves
`abiVersion` to `m5-65`.

M5b node `string-prototype-case` keeps the same component ownership and adds
ordinary and locale lower- and uppercase conversion, trimming, normalization,
and deterministic locale comparison. The generated
*runtime\_unicode\_tables.h* asset derives case maps, normalization data,
combining classes, and contextual case properties from the same pinned inputs
as `@oseo/unicode`; *runtime\_string.c* is its only consumer. The runtime never
consults host locale state, a C library classifier, or host Unicode data.

Fixed and generated native differential evidence covers full and contextual
case mapping, the ECMAScript trim set, canonical and compatibility
normalization including Hangul, canonical comparison, generic conversion and
abrupt completion, both specialization policies, false hints, deliberate
shape-guard misses, generic fallback, and collection at every safepoint. All
312 declared inventory paths are reviewed, with 290 passes and 22 explicit
prerequisite boundaries: nine `Reflect.construct`, nine Boolean-wrapper
intrinsic, and four dynamic `eval`. The node adds no generated-code entry point,
allocates seven code IDs inside the existing String range, adds the one
generated header asset, and moves `abiVersion` to `m5-84`.

M5b node `array-prototype-species-mapping` keeps ownership in
*runtime\_array.c* and adds ordinary `filter` and `map` functions to the
materialized `%Array.prototype%`. Both methods retain the shared
snapshot-length HasProperty and Get iteration contract, then create their
results through ArraySpeciesCreate. Array receivers perform the observable
`constructor` and `Symbol.species` reads, while generic receivers use the
realm Array without those reads. Fixed and generated native differential
evidence covers sparse and generic receivers, default and custom species,
abrupt reads, mutation, both specialization policies, generic fallback, and
collection at every safepoint. The node adds no generated-code entry point and
moves `abiVersion` to `m5-66`.

M5b node `array-prototype-copying` remains in *runtime\_array.c* because the
methods share ordinary property access, ArraySpeciesCreate, collector roots,
and recursion state with the existing Array intrinsic. Moving their loops into
generated code would add a runtime crossing without replacing any semantic
primitive. The component adds `concat`, `flat`, `flatMap`, `join`, `slice`,
`toLocaleString`, and `toString` to the materialized `%Array.prototype%`.

The copying paths preserve sparse HasProperty behavior and generic receiver
order. `concat` honors `Symbol.isConcatSpreadable`; `concat`, `flat`, `flatMap`,
and `slice` use ArraySpeciesCreate and propagate every constructor, species,
indexed, callback, and coercion abrupt completion. Flattening skips holes and
uses the deterministic runtime depth boundary for cycles or unbounded depth.
`toLocaleString` forwards the rooted outer locales and options as exactly two
arguments to every non-nullish element method, including two `undefined`
values when the caller omits them.
Fixed and generated native differential evidence covers both specialization
policies, every species fallback, false hints, deliberate guard hits and
misses, and collection at every safepoint. The node adds no generated-code
entry point and moves `abiVersion` to `m5-69`.

M5b node `array-prototype-sort` also remains in *runtime\_array.c* because
sorting reuses the same ordinary property access, collector roots, and
array-like length reading the copying methods already own. The component adds
`sort` and `toSorted` to the materialized `%Array.prototype%` and retires the
`sort` entry from the unadmitted boundary table.

Both methods reject a non-callable comparator before converting the receiver.
SortIndexedProperties then reads every index into one collected list, skipping
holes for `sort` and reading through them for `toSorted`, before the first
comparison runs. The collected list roots its own storage and grows in place,
because the element count is unknown until the read loop ends; every slot the
list declares to the collector stays initialized. One bottom-up merge sort over
that list and one equally rooted scratch buffer supplies the required
stability and stops at the first abrupt comparison. `sort` then writes the
sorted elements back with Set and deletes the trailing indices with
DeletePropertyOrThrow, while `toSorted` fills the plain Array it allocated
before reading, which is why neither method reads `constructor` or
`Symbol.species`.

Fixed and generated native differential evidence covers sparse, generic, and
frozen receivers, undefined and hole ordering, comparator coercion and abrupt
completion, stability, mutation observed through accessors during collection
and write-back, both specialization policies, false hints, deliberate guard
hits and misses, and collection at every safepoint. The node adds no
generated-code entry point, allocates its two code IDs inside the existing
Array range, and moves `abiVersion` to `m5-76`.

M5b node `array-prototype-reduction` also remains in *runtime\_array.c*
because both methods reuse the ordinary property access, collector roots, and
array-like length reading the iterative methods already own. The component
adds `reduce` and `reduceRight` to the materialized `%Array.prototype%` and
retires both entries from the unadmitted boundary table.

One accumulator loop serves both methods: `reduce` visits ascending indices
and `reduceRight` descending ones over the shared HasProperty/Get path, so
holes are skipped and inherited entries participate. The receiver is
converted and its length read before the callable check, initial-value
presence follows the argument count rather than an undefined test, a missing
initial value is replaced by the first present element in traversal order,
and a traversal that ends without an accumulator throws a TypeError. The
callback receives the accumulator, element, index, and converted receiver
with an undefined this value, and the receiver, callback, and accumulator
stay rooted across user code, so element and accumulator identity survive a
collection inside any callback or accessor.

Fixed and generated native differential evidence covers sparse, generic,
inherited, primitive, and frozen receivers, both traversal orders,
accumulator seeding, the empty-traversal TypeError, callback argument order,
abrupt completion at each observable step, mutation during the
snapshot-length loop, both specialization policies, false hints, deliberate
guard hits and misses, and collection at every safepoint. The node adds no
generated-code entry point, allocates its two code IDs inside the existing
Array range, and moves `abiVersion` to `m5-83`.

M5b node `array-prototype-index-search` also remains in *runtime\_array.c*
because relative-index search reuses the ordinary property access,
array-like length conversion, and collector roots the other Array methods
own. The component adds `at`, `includes`, `indexOf`, and `lastIndexOf` to the
materialized `%Array.prototype%` and retires the two deferred search entries.

All four methods convert the receiver and snapshot its length before relative
index conversion. `indexOf` and `lastIndexOf` traverse present properties in
opposite directions through HasProperty then Get and compare with strict
equality. `includes` reads through holes and uses SameValueZero, while `at`
performs one direct Get or returns undefined out of range. The receiver and
searched value remain rooted across conversion and property access, so generic
and inherited receivers, live mutation, and identity survive collection.

Fixed and generated native differential evidence covers strict equality,
SameValueZero, sparse and generic receivers, both search directions, relative
indices and infinities, observable ordering, mutation, abrupt completion, both
specialization policies, false hints, deliberate guard hits and misses,
generic fallback, and collection at every safepoint. The node adds no
generated-code entry point, allocates four code IDs inside the existing Array
range, and moves `abiVersion` to `m5-85`.

### Function prototype evidence

M5b node `function-prototype` completes the callable realm root in
*runtime\_function.c*. The component owns `call`, `apply`, `bind`, `toString`,
`Symbol.hasInstance`, bound-function state, source-text state, and the circular
`Function` constructor link. The shared primitive component delegates
`instanceof` to the callable right operand's `Symbol.hasInstance` method and
uses `oseo_internal_ordinary_has_instance` for the standard fallback.

The public function-kind and intrinsic tables expand, moving `abiVersion` to
`m5-48`. Fixed and generated native differential evidence covers descriptors,
bound calls and construction, source forms, custom has-instance dispatch, both
specialization policies, deliberate shape-guard misses, and forced collection.
The node reviews all four of its declared test262 inventory roots.

### Array constructor evidence

M5b node `array-constructor` makes `Array` a replaceable intrinsic value and
completes its realm cluster in *runtime\_array.c*. The component owns the
length-argument constructor, `Symbol.species`, `from`, `of`, and `isArray`.
`Array.from` shares the iterator component and closes an active iterator when
mapping or indexed definition becomes abrupt. Both collection statics use the
ordinary construction ABI for a constructible receiver and fall back to a
realm array otherwise. Unadmitted pre-ES2015 Array prototype methods have
descriptor-complete boundary functions that retain an explicit unsupported
capability until their own graph nodes land.

The public intrinsic table expands, moving `abiVersion` to `m5-61`. Fixed and
generated native differential evidence covers descriptors, sparse length
construction, generic receivers, iterator closing, both specialization
policies, false hints, deliberate shape-guard misses, and forced collection.
The node reviews only its declared Array test262 inventory roots.

### Object-family split evidence

The M5b preparation unit divided the 3,168-line *runtime\_object.c* into
eight translation units totaling 3,263 lines. The 95-line growth is the
per-unit include lines, the ownership comment each file now carries, and
the statements re-wrapped to stay at or below 80 columns after eleven
helpers took the longer `oseo_internal_` names:

| Component                    | Lines |
| ---------------------------- | ----- |
| *runtime\_string.c*          | 114   |
| *runtime\_object.c*          | 285   |
| *runtime\_property.c*        | 549   |
| *runtime\_descriptor.c*      | 405   |
| *runtime\_array.c*           | 472   |
| *runtime\_object\_builtin.c* | 728   |
| *runtime\_arguments.c*       | 311   |
| *runtime\_enumeration.c*     | 399   |

The split moved function bodies without editing them. Comparing the
token streams of every function before and after, the only differences
are inserted line breaks and braces around single-statement `if` bodies
that the 80-column rule required. External text symbols across the
family grew from 42 to 53, which is exactly the eleven promoted helpers
(`oseo_internal_ascii_string`, `oseo_internal_string_equal`,
`oseo_internal_property_key_equal`, `oseo_internal_array_index`,
`oseo_internal_string_own_property`,
`oseo_internal_own_property_index`, `oseo_internal_remove_property`,
`oseo_internal_grow_properties`,
`oseo_internal_cell_backed_property`,
`oseo_internal_require_property_key`, and
`oseo_internal_set_array_length`); no public declaration in
*oseo\_runtime.h* was added, removed, or changed.

`abiVersion` stays `m5-43`. It names the generated-code ABI contract
*oseo\_runtime.h* declares, and that contract is untouched. The archive
reuse key already hashes every asset's name, kind, and contents, so a
source reorganization invalidates a cached archive without a version
bump.

On `linux-x86_64-gnu`, `mise run check`, `mise run test`,
`mise run test:native`, `mise run test:test262`, and
`mise run test:property:native` all passed, with the pinned test262
subset reporting `tests=4861/4861 pass=2934`, unchanged from the
ratchet baseline.

### Evidence compared with the baseline

With the same pinned Zig, strict C11 warnings, and sanitizer
configuration on `macos-aarch64`:

 -  external text symbols grew from 110 to 124: the 110 public
    declarations are unchanged, and the 14 `oseo_internal_` helpers are
    the intended cross-component mechanism;
 -  the sanitized runtime archive is 994 KiB across eight objects,
    against the 876 KiB single baseline object; the growth is the
    expected duplication of `static inline` value helpers and sanitizer
    metadata across translation units;
 -  the `console.log("hello")` fixture executable is 1.2 MiB against the
    1.1 MiB baseline, with identical observable output;
 -  JavaScript observations are unchanged: the complete differential
    fixture corpus, the pinned test262 manifest with canonical digest
    `sha256:d4345fd27f1f2c4099197b28b2249e0c2943d42ffd8f2a8dedcb36ccc367ac34`,
    and the target parity record all pass unmodified.

### Closing verification

The clean-checkout verification ran on macOS AArch64 from a fresh
detached Git worktree of the commit that recorded the ownership rules,
with dependencies installed by `mise deps` into the fresh tree. All of
the following passed in order with no failure or interruption:

1.  `mise run check`;
2.  `mise run test`, covering the Node.js and Deno package tests, the
    host-native differential fixtures with the AArch64 Linux cross-link
    and strict-warning and sanitizer policies, the architecture probes,
    and the pinned test262 subset;
3.  `mise run test:property:native`;
4.  `mise run test:property:extended` at ten times the ordinary case
    budget under both hosts.

In the compared symbol and size metrics, the only differences from the
recorded baseline are the ones explained above: the fourteen intended
`oseo_internal_` symbols, and the archive and fixture growth from
per-unit duplication of `static inline` value helpers and sanitizer
metadata.

Continuous integration then confirmed the same result on both supported
execution targets:
[run 29688299958]
at commit `918535a` passed the repository check job, all six
bootstrap-host test jobs, and both native jobs, with
`test-native (ubuntu-latest, linux-x86_64-gnu)` and
`test-native (macos-15, macos-aarch64)` each running `mise run check`,
`mise run test`, and `mise run test:property:extended` green. This
closes the plan.

[run 29688299958]: https://github.com/dahlia/oseo/actions/runs/29688299958


Baseline before extraction
--------------------------

The baseline was recorded on the commit that introduced this document, with
`mise run check` and `mise run test` passing from the same working tree on
macOS AArch64. The baseline native observations are the checked-in records
at that commit: the reviewed differential fixture corpus in
*tests/native.ts* (Node.js, Deno, specialization-disabled, and
specialization-enabled native execution with selected forced-collection
fixtures and the AArch64 Linux cross-link) and the pinned test262 manifest
*tests/test262/results.yaml* with canonical digest
`sha256:d4345fd27f1f2c4099197b28b2249e0c2943d42ffd8f2a8dedcb36ccc367ac34`
and its digest-pinned target parity record
*tests/test262/target-parity.yaml*. The migration must reproduce these
observations unchanged.

### Runtime assets

`@oseo/runtime-c` publishes one versioned runtime input with
`abiVersion` `m5-4` and exactly two reviewed assets, in this order:

1.  *native/oseo\_runtime.h*, 550 lines, kind `header`;
2.  *native/runtime.c*, 5,566 lines, kind `source`.

`RuntimeInput.assets` can already describe more than one source, but
`NativeBuildInput` carries a single `runtimeSourcePath`, and the CLI,
`@oseo/testkit`, and the Zig adapter select exactly one C source. The
package check requires both *native/oseo\_runtime.h* and
*native/runtime.c* in the packed npm artifact; it does not reject
additional native assets.

### Generated-code ABI declarations

*oseo\_runtime.h* declares the complete generated-code boundary:

 -  the `OseoValue`, `OseoStatus`, `OseoFunctionKind`, `OseoResult`,
    `OseoRootFrame`, `OseoContext`, `OseoFunctionDispatcher`,
    `OseoPromiseState`, `OseoPropertyAttributes`, and `OseoPropertyCache`
    types, with `OseoContext` and `OseoRootFrame` layouts fully visible
    and `OseoHeapObject` forward-declared as an opaque type;
 -  four `static inline` guarded-path primitives: `oseo_value_is_smi`,
    `oseo_value_unbox_smi`, `oseo_smi_try_add`, and `oseo_value_box_smi`;
 -  110 function declarations, every one defined exactly once in
    *runtime.c*.

### Archive symbols

Compiling *runtime.c* alone for `macos-aarch64` with the repository's
pinned Zig, strict C11 warnings, and the address and undefined-behavior
sanitizers yields 110 external text symbols. Every external symbol uses the
`oseo_` prefix and matches one declaration in *oseo\_runtime.h*; no
internal helper leaks external linkage. The same translation unit defines
110 `static` file-local helpers plus six `static` forward declarations
(`to_number`, `own_descriptor`, `promise_method_function`,
`timer_array_string`, `timer_delay_number`, and
`timer_default_array_string`), each naming a helper defined later in the
same file.

### Selected sizes

With the sanitizer configuration above on `macos-aarch64`:

| Artifact                                  | Size    |
| ----------------------------------------- | ------- |
| *runtime.o* (single translation unit)     | 876 KiB |
| `console.log("hello")` fixture executable | 1.1 MiB |

### Property budgets

The ordinary gate runs the reviewed per-property case floors from
[*PLAN-PT.md*](../PLAN-PT.md): 1,000 cases for pure model properties, 250
for compiler-stage properties, and 10 for native compile-and-execute
properties, using the checked-in seed set. The extended tier
(`mise run test:property:extended`) runs ten times the ordinary budget at
large size with seeds 1592590337, 1592590338, and 1592590339.

### Dependency inventory

The single translation unit groups its 220 function definitions into the
responsibilities named by the plan. The observed
cross-responsibility dependencies that shape the internal header are:

 -  Value tagging, kind predicates, and heap-object casts are used by every
    responsibility and are small enough to remain inline.
 -  GC-managed heap allocation and publication (`allocate_heap_bytes`,
    `publish_heap`) are called by every responsibility that creates heap
    objects; collection and tracing must see every heap kind. Root slot
    arrays, object property storage, coercion text buffers, and
    timer-conversion string buffers are separate direct `calloc`, `malloc`,
    or `realloc` allocations with their own cleanup paths. The complete
    accounting and ownership of those allocations is planned in
    [*PLAN-GC.md*](../PLAN-GC.md).
 -  Coercions (`to_number`, `value_string`, `ascii_string`) are called from
    object semantics (array length, property keys, descriptors) and from
    operators, console output, and timer argument conversion.
 -  Generic property access calls back into promise code:
    `oseo_object_get` materializes `then`, `catch`, and `finally` through
    `promise_method_function`. This object-to-promise edge is the one
    planned cycle to resolve or document during extraction.
 -  Promise job execution is entered from two scheduler paths: entry-task
    and event-loop checkpoints call `oseo_jobs_drain`, while a timer turn
    drains through `jobs_drain_until` together with the rejection
    checkpoint; timers and `await` call back into promise construction and
    function dispatch.
 -  Function creation builds on ordinary objects, and generic dispatch is
    invoked from promises, timers, and the event loop through the
    context's function dispatcher.
