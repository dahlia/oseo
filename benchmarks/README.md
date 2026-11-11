Performance corpus
==================

This is the initial corpus for the Measurement checkpoint of
[*PLAN-PERF.md*](../PLAN-PERF.md). It contains correctness workloads, not
published performance results. Richards, DeltaBlue, n-body, and ray tracing
remain candidates for later corpus expansion; this initial set makes no
claim about their behavior or performance.

| Kernel          | Fixed input                      | Self-check                               | License      |
| --------------- | -------------------------------- | ---------------------------------------- | ------------ |
| Sieve           | Integers through 5,000           | 669 primes                               | MIT          |
| Permute         | Six-element array                | 8,660 recursive visits                   | MIT          |
| JSON round-trip | 100 records with quoted strings  | Strings preserved; even IDs sum to 2,450 | GPL-3.0-only |
| RegExp          | 100 repeated three-field records | Parsed numbers sum to 17,400             | GPL-3.0-only |

Sieve and Permute adapt the corresponding
[Are We Fast Yet? kernels].
Their MIT permission and copyright notices remain in each file, preserving
their upstream attribution. The CommonJS benchmark superclass and runner are
replaced with a plain `benchmark()` function. Permute's per-instance state
becomes local state. The algorithms, input sizes, and expected results are
unchanged. These adaptations are not scores from the upstream benchmark suite.

JSON round-trip and RegExp are original Oseo workloads under the repository's
[*GPL-3.0-only license*](../LICENSE). They exercise allocation and common
built-ins without importing libraries or requesting new language features.
All four sources are plain JavaScript Script programs. The generated wrapper
runs the same source on every engine, checks every iteration, and throws on
a wrong checksum before printing the completion marker. An absent marker,
a nonzero exit, or an extra output line invalidates a sample.

`mise run check:perf` builds its package dependencies, runs kernel
correctness checks, and injects a wrong computation into each kernel to
prove that its self-check fails. It also exercises the driver with fake
executors. These checks produce no comparison measurements.

`mise run perf:prepare` writes sources, startup controls, SEA configuration
and command recipes without building or measuring. `mise run perf:build`
prepares a separate fresh directory selected by `OSEO_PERF_DIRECTORY`, then
builds all nine forms, including both Oseo policies through the landed
optimized compiler API. Neither command overwrites an existing destination;
a prepared directory is an inspection input, not a build destination.

After building, `mise run perf:correctness` executes the frozen 36 kernel,
8 observed, and 9 startup roles once. Set `OSEO_PERF_DIRECTORY` to the build
directory and `OSEO_PERF_RESULTS` to a fresh directory outside the checkout.
It checks the original 100 kernel iterations and one startup iteration,
retains raw bytes and failures, and creates no performance populations.
The producing host, clean source revision, tools, pins and artifact hashes
must match before and after execution.

Root assigns the exclusive slot for `mise run perf:measure`, which executes
the frozen build artifacts. The
[*evidence contract*](../docs/evidence/performance/README.md) describes its
configuration, raw journals, artifact roles and publication requirements.

[Are We Fast Yet? kernels]: https://github.com/smarr/are-we-fast-yet/tree/74306fec151070fd07157cefeacf19e7e0bcdc89/benchmarks/JavaScript
