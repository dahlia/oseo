Linux GDB feasibility
=====================

GDB recovered runtime, generated-C and `main()` frames from an optimized
Oseo executable without installing tools or adding debug flags. This is
synthetic method smoke, not a performance-corpus profile or timing result.
The shorter program's capture failed its all-stops check after four useful
stops because the target exited. A separate longer program completed all
eight planned attachments, with useful allocation and generic call context.


Short program
-------------

The script requested eight stops: four captures succeeded, the fifth
attachment failed after target exit, and three were not attempted.

The source tree was the approved optimized main base
`28c379bbac973894a41f562f26417b694bb0aa1c`; no compiler/runtime files were
modified. The retained executable's SHA-256 before and after capture was
`c7ff72bfefbd3542d1392f5b3af8664493e6990623fd2e4f207ec11bf22ba932`.
No timed artifact or timing population exists: `timedArtifactId` is `null`.
That hash therefore establishes smoke identity only, not equality with
future timing evidence. The original executable and runtime build inputs
remain at the paths recorded in the raw build observation and lane handoff.

The fixed program makes 200,000 loop iterations, allocating an object,
reading its property and calling an unhinted addition function. Its exact
stdout is `649994` followed by a newline, with empty stderr and exit 0 in
the native correctness run and profiled run. An independent arithmetic
check is `28571 * 21 + 3 + 200000 * 0.25 = 649994`.
Its workload is unchanged during sampling. Correct output does not prove
that each operation has a separately sampled frame.

| Stop | Observed chain                                                                    | Limit                                                            |
| ---- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 0    | `oseo_cell_initialize()` → `oseo_function_script()` → `main()`                    | Some arguments optimized out; runtime source listing unavailable |
| 1    | `oseo_internal_clear_heap_marks()` → `oseo_context_destroy()` → `main()`          | Teardown, not loop allocation or collection cost                 |
| 2–3  | `oseo_internal_retire_registered_symbols()` → `oseo_context_destroy()` → `main()` | Teardown; two observations do not establish a cost fraction      |
| 4    | No stack; zombie/ptrace diagnostic, GDB exit 1                                    | Failed attachment after target termination                       |

These stops support a generic-helper label for the first chain and a
separate teardown label for the others. Allocation/collection inside the
loop, property lookup, call dispatch and numeric boxing remain unassigned.
In particular, clearing heap marks during destruction does not measure
steady-state collection. `-O2` inlining, tail calls, dead-code removal,
optimized-out values, a 16-frame cap, attachment bias and short lifetime
limit attribution. No sample percentages or helper timings are derived.


Longer program
--------------

*longer-workload/* retains a separate two-million-iteration program and
capture. Its unchanged before/after executable SHA-256 is
`c1d9ee3253f0bbd2e95189e6b2e1341f8884642e419e32958da6321a313b0979`.
It prints `6499995` and a newline with empty stderr and exit 0, matching
the native preflight and `285714 * 21 + 1 + 2000000 * 0.25 = 6499995`.
Every requested attachment succeeded, and every captured chain reaches
generated C and `main()`. This workload size belongs only to this smoke;
the benchmark corpus and its budgets are unchanged.

| Stops  | Resolved context                                                                      | Attribution limit                                                                   |
| ------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 0      | Binding read through `oseo_cell_get()`                                                | Generic helper context; not property lookup                                         |
| 1      | libc allocation through `oseo_environment_create()` and `oseo_environment_clone()`    | Allocation site and caller, not allocation count or collection cost                 |
| 2      | `oseo_property_key()` and generated key conversion                                    | Key conversion, not evidence of lookup-table traversal                              |
| 3–4, 7 | libc allocation through `oseo_cell_create()`, generated callee and generic call entry | Allocation leaf with overlapping call context; callee work is not dispatch overhead |
| 5      | Generated script body                                                                 | Unassigned instruction cost                                                         |
| 6      | `oseo_to_numeric()`, `numeric_binary()` and `oseo_remainder()`                        | Numeric coercion, not proof of boxing or heap allocation                            |

The call-context chain includes `oseo_dispatch_function()`,
`call_in_running_realm()`, `call_once()` and `oseo_call_function()`.
GDB may reconstruct inline frames; this is not proof of one physical
frame per source function. Optimized argument values are unreliable for
semantic reconstruction. Generic helpers, allocation sites and call
context are distinguishable here, while property lookup, numeric boxing
and steady-state collection remain unknown. Raw stop counts are method
coverage records and supply no cost shares.


Evidence files
--------------

Files ending in *.txt* preserve raw JSON, source and script bytes without
formatting them. *files.json* indexes their byte lengths and SHA-256 values.
The scripts contain the absolute paths used for this attempt; they are
audit inputs, not portable launch commands. *build-observation.json.txt*
retains the complete compiler invocation list, optimized configuration,
target, output and artifact identity. *generated.c.txt* preserves the
translation unit needed to inspect the generated caller.

The launcher _\*.receipt.json.txt_ files record enqueue UTC before `Popen`,
argv, cwd, PID and the private temporary directory. These attempts used the
older gate wrapper: its `startedAt` follows lock admission and `finishedAt`
follows the command, with no separate lock-acquisition timestamp. Neither
field is a queue-entry time. The GDB receipts retain each attachment's UTC
boundaries; no missing timestamps have been inferred or backfilled.
Both smoke attempts used the ordinary heavy lock,
private temporary directory and lane Zig cache with `measure: false`.
Each GDB receipt records attachments and raw outputs; the short run does not
convert the failed final attachment into a successful sample. No perf
event loss counter is available from this debugger method. macOS and
actual corpus/timed-hash acceptance are still required by
[*profiling.md*](../../profiling.md).
