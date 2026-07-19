C runtime componentization evidence
===================================

Status
------

This document records the evidence required by
[*PLAN-RCR.md*](../PLAN-RCR.md). The baseline section below is the
comparison point taken before the first extraction; the ownership section
records the completed component layout. The baseline is not a promise of
byte-identical object files; it exists so that behavior, symbol, and size
differences introduced by the migration remain explainable.


Component ownership after extraction
------------------------------------

The runtime input now lists ten reviewed assets in this order:
*oseo\_runtime.h*, *runtime\_internal.h*, *runtime\_core.c*,
*runtime\_memory.c*, *runtime\_binding.c*, *runtime\_object.c*,
*runtime\_function.c*, *runtime\_primitive.c*, *runtime\_promise.c*, and
*runtime\_event\_loop.c*. No catch-all *runtime.c* remains, and no
temporary forwarding helper was needed at any point in the migration.
Each source compiles as its own translation unit and is archived in
exactly this order. The symbols test in
*packages/runtime-c/tests/symbols.test.ts* enforces the reviewed list,
the include boundaries, and the one-definition rule on every change.

Ownership follows the target layout in [*PLAN-RCR.md*](../PLAN-RCR.md):

 -  *runtime\_core.c*: results, context lifecycle, diagnostics, call
    limits, frames, root-stack operations, and immediate value
    constructors;
 -  *runtime\_memory.c*: GC-managed heap allocation, publication,
    tracing, collection, and destruction;
 -  *runtime\_binding.c*: environments, binding cells, and module
    namespaces;
 -  *runtime\_object.c*: strings used as property keys, arrays, ordinary
    objects, descriptors, prototypes, property caches, and the `Object`
    built-ins;
 -  *runtime\_function.c*: function creation, callable metadata,
    construction, and generic dispatch;
 -  *runtime\_primitive.c*: coercions, arithmetic, comparison, string
    conversion, and console output;
 -  *runtime\_promise.c*: promises, capabilities, reactions, thenable
    jobs, combinators, rejection tracking, and job draining;
 -  *runtime\_event\_loop.c*: timer conversion, timer queues, task
    checkpoints, top-level await progress, and shutdown.

### Internal helpers

Fourteen helpers cross a translation-unit boundary. Each uses the
`oseo_internal_` prefix, has exactly one declaration in
*runtime\_internal.h*, and is defined in its owning unit:

| Internal helper                                     | Defined in             |
| --------------------------------------------------- | ---------------------- |
| `oseo_internal_allocate_heap_bytes`                 | *runtime\_memory.c*    |
| `oseo_internal_publish_heap`                        | *runtime\_memory.c*    |
| `oseo_internal_allocate_string`                     | *runtime\_object.c*    |
| `oseo_internal_string_is_ascii`                     | *runtime\_object.c*    |
| `oseo_internal_own_descriptor`                      | *runtime\_object.c*    |
| `oseo_internal_to_number`                           | *runtime\_primitive.c* |
| `oseo_internal_value_string`                        | *runtime\_primitive.c* |
| `oseo_internal_promise_method_function`             | *runtime\_promise.c*   |
| `oseo_internal_promise_invoke_then`                 | *runtime\_promise.c*   |
| `oseo_internal_promise_aggregate_settle`            | *runtime\_promise.c*   |
| `oseo_internal_promise_finally_continuation_create` | *runtime\_promise.c*   |
| `oseo_internal_promise_finally_invoke`              | *runtime\_promise.c*   |
| `oseo_internal_jobs_drain_until`                    | *runtime\_promise.c*   |
| `oseo_internal_jobs_reached_promise`                | *runtime\_promise.c*   |

### Documented component cycles

The extraction confirmed these irreducible cycles. Each is accepted as a
pair of named interfaces rather than removed, because both directions
express observable language semantics:

 -  object to promise: `oseo_object_get` materializes `then`, `catch`,
    and `finally` through `oseo_internal_promise_method_function`, while
    promise code builds ordinary objects through public object
    operations;
 -  function to promise: generic dispatch executes the internal promise
    built-in code IDs through the promoted `oseo_internal_promise_*`
    helpers, while promise code re-enters callables through
    `oseo_call_function`;
 -  object and primitive: array-length and descriptor semantics call
    `oseo_internal_to_number`, while coercions and operators use public
    object reads and `oseo_internal_own_descriptor`;
 -  binding and object: module-namespace creation builds its backing
    object through public object operations, while object property reads
    resolve module-namespace entries through `oseo_cell_get`.

The event-loop component is a one-way dependent: timer turns drain jobs
through `oseo_internal_jobs_drain_until` and
`oseo_internal_jobs_reached_promise`, and `await` and timers construct
promises through promise-owned entry points, while no promise code calls
into the event loop.

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
metadata. This closes [*PLAN-RCR.md*](../PLAN-RCR.md).


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
responsibilities named by [*PLAN-RCR.md*](../PLAN-RCR.md). The observed
cross-responsibility dependencies that shape the internal header are:

 -  Value tagging, kind predicates, and heap-object casts are used by every
    responsibility and are small enough to remain inline.
 -  GC-managed heap allocation and publication (`allocate_heap_bytes`,
    `publish_heap`) are called by every responsibility that creates heap
    objects; collection and tracing must see every heap kind. Root slot
    arrays, object property storage, coercion text buffers, and
    timer-conversion string buffers are separate direct `calloc`, `malloc`,
    or `realloc` allocations with their own cleanup paths.
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
