C runtime componentization evidence
===================================

Status
------

This document records the evidence required by
[*PLAN-RCR.md*](../PLAN-RCR.md). The baseline section below is the
comparison point taken before the first extraction. Later sections record
the component ownership rules as the migration lands. The baseline is not a
promise of byte-identical object files; it exists so that behavior, symbol,
and size differences introduced by the migration remain explainable.


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
