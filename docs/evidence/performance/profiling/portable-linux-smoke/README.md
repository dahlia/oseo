Portable Linux capture evidence
===============================

The portable method probe built an optimized, unsanitized Linux x64
executable through the public Oseo APIs and recovered all eight requested
GDB stops. Each report names the owned PID and resolves generated user and
runtime frames. The separate correctness preflight and captured run print
`6499995` followed by a newline, with empty stderr and exit status zero. This
is a synthetic method probe under the ordinary heavy gate, with no timing or
RSS population and no timed-corpus artifact ID. Actual Mac execution and final
corpus acceptance remain pending.

The executable is 4,333,744 bytes, mode `0755`, with unchanged SHA-256
`436aba5cf05523c69f827bee248369e706a240d0dd6a74c3d8dc889b4b33351e`.
The before/after `readelf -n` output agrees but reports only an ABI note,
not an ELF build ID. SHA-256 establishes byte identity here. The profiler's
resolved executable and before/after digests are preserved separately.
All seventeen owned process groups exited and were reaped: one discovery
process, two target launches, eight debugger invocations, two symbol
inspections and four source-state Git commands. The synthetic builder also
preserves its individual build process records.

The source matches the unchanged two-million-iteration longer smoke described in
[*the earlier evidence*](../linux-smoke/README.md). These are newly built
bytes at a different path, not the earlier executable or a timed artifact.
The capture records the source `HEAD` and dirty state; it is an implementation
check before a final source commit, not a clean integration candidate.
The three helper-source snapshots match the code that ran. *request.json.txt*
freezes the explicit `argv`, empty environment, `cwd`, empty stdin, byte oracle
and all supplied input hashes.


Observed context and limits
---------------------------

| Stops | Source-linked observation                                                                                     | Limit                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 0     | `oseo_number()` through `numeric_binary()`, generated callee and generic dispatch                             | Number representation construction, not heap allocation or measured boxing cost     |
| 1     | `oseo_cell_create()` reaches libc allocation through the generated callee and generic dispatch                | Allocation site and overlapping call context, not allocation count or dispatch cost |
| 2     | `oseo_cell_initialize()` has a generated script caller                                                        | Binding initialization, not property lookup                                         |
| 3–4   | `oseo_internal_grow_properties()` within `define_data_property()`, including a libc allocation leaf in stop 4 | Property-storage growth during definition, not the later property read              |
| 5     | `builtin_dispatcher()`, `call_in_running_realm()` and `oseo_call_function()` have a generated caller          | Generic dispatch context, not invocation count                                      |
| 6–7   | `oseo_roots_allocate()` reaches libc memory initialization or allocation from the generated callee            | Root-frame storage, not numeric heap boxing                                         |

The definition in the retained generated C calls `oseo_object_define()` at
line 274. Its runtime chain grows property storage through
[*runtime\_descriptor.c*](../../../../../packages/runtime-c/native/runtime_descriptor.c)
line 590 and
[*runtime\_object.c*](../../../../../packages/runtime-c/native/runtime_object.c)
line 224. The binding cell allocation is defined in
[*runtime\_binding.c*](../../../../../packages/runtime-c/native/runtime_binding.c).
`oseo_number()` in
[*runtime\_core.c*](../../../../../packages/runtime-c/native/runtime_core.c)
line 433 constructs tagged small integers or double bits without a heap
allocation. Its observed frame supports representation construction context; it
does not establish which optimized branch or instruction dominates its cost.
The complete runtime inputs are frozen by the request and file map; optimized
argument values remain unreliable. Property-read lookup costs, boxing cost and
steady-state collection remain unresolved. No stack count becomes a CPU share,
call count or cost ranking.

No unknown frame, 16-frame-cap hit or explicit sample-loss diagnostic was
detected in these eight reports. This is a conservative text check, not proof
that all native frames survived inlining or tail calls. Optimized-out values
and GDB virtual runtime-source warnings are retained. The debugger has no
`perf`-style lost-event counter; that field is unavailable. Mac `sample` has
its own semantics and still needs actual hosted CI evidence.


Preserved failures and retrieval
--------------------------------

*initial-failed-predicate/* preserves the first portable attempt's raw
summary and individual process/capture outputs. All eight attaches and the
output oracle succeeded, but the initial predicate rejected one generated-only
stack; seven other stops resolved both generated and runtime frames. That
attempt remains `failed-or-incomplete`. The current predicate distinguishes
useful generated-only context from runtime attribution and still requires all
eight useful user stacks and actual runtime context in the complete probe.
It never drops a stop or treats tool exit status zero alone as success.

The prior short and longer workload evidence in *../linux-smoke/* is unchanged,
including the short run's failed attach and unattempted stops. The new primitive
was also exercised on an already-built artifact without rebuilding it;
that separate private capture and every development failure remain retained.

Raw files here preserve their original bytes; JSON and source files gain a
*.txt* suffix to keep formatting tools from rewriting them. *files.json*
indexes these checked-in bytes. The executable, numbered input copies,
runtime inputs, archive dependencies, full build sidecars and gate receipts
remain in the durable lane directory
*~/.local/state/oseo-preview/lanes/perf-profiling/capture-ci-20261109/*.
*actual-raw-files.json* there indexes each private file's path, size and digest;
*linux-smoke-g/* is this successful probe, and *linux-existing-b/* is the
existing-artifact capture. These are local retained paths, not published
immutable remote assets. The CI job additionally archives its complete
new `RUNNER_TEMP` bundle with executable modes before the mandatory upload.
