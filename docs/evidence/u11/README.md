U11 native runtime profiling evidence
=====================================

These diagnostic templates instrument runtime asset text as the host reads it.
They do not edit runtime or compiler sources, the reviewed subset, or manifests.
*prepare.py* creates temporary *tools/u11-runner.ts* and *tools/u11-bench.ts*
wrappers from the current runner. Remove those wrappers before checking or
committing. The wrappers import the selected *tests/native-toolchain.ts*
compiler through the existing runner.

The instrumented runtime uses the gate's ordinary Zig flags, including
`-O2` for runtime objects and `-fsanitize=address,undefined`. `U11_MODE=nosan`
removes only the sanitizer flags for an explanatory control. That control
uses a separate Oseo cache namespace and is not a proposed gate configuration.
All builds share the single assigned Zig cache directory.

Counters record calls to `oseo_collect`, allocation attempts (managed and
work-area allocations), calls to `oseo_internal_own_property_index`, and
property-key comparisons inside that lookup. `large_comparisons` counts the
comparisons in objects with at least 1,000 own properties. `clock()` measures
process CPU at teardown and inclusive collector and own-property lookup CPU.
Lookup timing and counters add overhead; the instrumented totals are a profile,
not a gate performance comparison. Collector timing includes its teardown call.
Subtracting collector CPU from total CPU gives non-collector CPU, including
startup, lookup instrumentation, and teardown work outside collection.

The single case keeps the upstream 10,000-element array and runs the
non-strict, specialization-enabled variant. The shard selects zero-based
positions congruent to 2 modulo 200 from this checkout's reviewed order,
executes every admitted variant, and asserts exact canonical agreement with
its checked-in records. No result is regenerated on disk.

Reproduce from the source revision recorded in *host.log*:

~~~~ sh
python3 docs/evidence/u11/prepare.py
ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-native-case-runtime-cost \
  XDG_CACHE_HOME=/tmp/u11-evidence/cache-profile \
  U11_MODE=profile U11_RESULT=/tmp/u11-evidence/case-profile.json \
  mise exec -- node tools/u11-bench.ts
ZIG_GLOBAL_CACHE_DIR=/data/zig-cache/m5ci-native-case-runtime-cost \
  XDG_CACHE_HOME=/tmp/u11-evidence/cache-profile \
  U11_MODE=profile U11_SAMPLE=shard \
  U11_RESULT=/tmp/u11-evidence/shard-profile.json \
  mise exec -- node tools/u11-bench.ts
rm tools/u11-runner.ts tools/u11-bench.ts
~~~~

A warm run retains both Oseo and Zig caches. A cold Oseo namespace does not
establish a cold Zig build; these two states are reported separately.

The host wrapper captures the diagnostic `U11` stderr lines before removing
only those added lines from the observation returned to the runner. All
program and sanitizer diagnostics remain intact. An initial shard pilot
returned the timing lines verbatim and the runner correctly rejected their
variant-dependent bytes; that pilot is excluded from the accepted sample.
The successful rerun preserves exact reviewed-manifest comparison.
`profile3` predates the stderr-strip correction, so its stored result still
contains the diagnostic line. Only the host's JavaScript stderr handling
changed; the runtime counters are identical to those in `nosan1`.
The compactor requires exactly one profile line per native execution for
instrumented runs. Agent processes with multiple contexts are outside this
probe's scope and cannot produce an accepted aggregate.

The native interval is measured around the process launch/completion boundary.
Command wall/user/system time comes from GNU `time` around the Node wrapper;
it includes compilation and preparation. The two quantities are separate.
Run `python3 docs/evidence/u11/compact.py RAW OUTPUT` to preserve the selected
raw results and derive sums and CPU percentages. Every profile row remains in
*measurements.json.txt*, so totals can be recomputed without binaries or caches.

*run.py* repeats the accepted serial protocol using a caller-selected raw-output
directory and the same fixed Zig lane. The original execution used equivalent
shell commands, with a failed stderr-comparison pilot before `shard2`; the
preserved templates include the corrected stderr capture. *compact.py* skips
unfinished runs and represents unavailable baseline CPU profiles as `null`,
never as measured zero. The committed artifact contains all five completed
runs. The Oseo namespaces were empty for their first relevant archive builds;
the Zig lane was retained throughout, so no cold Zig timing is claimed.

The coordinator deferred runtime edits after the mandatory Phase B ask and
explicitly allowed leaving macOS unmeasured. This record is input for M5c
runtime design, with no claimed CI capacity recovery.
