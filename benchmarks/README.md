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

`mise run check:perf` runs the kernels for correctness and injects a wrong
computation into each to prove that its self-check fails. These are unit
checks, not comparison measurements. `mise run perf:prepare` writes the
fixed input programs, startup control, SEA configuration files, source
digests, and engine command plans under *artifacts/.oseo-perf/prepared/*. It
refuses an existing destination. Preserve that directory with its eventual
run, or remove it explicitly before preparing another run.

The preparation command does not build executables or measure workloads.
Oseo's two policy forms stay blocked until Root integrates the optimized
build and retained executable units. The
[*evidence contract*](../docs/evidence/performance/README.md) defines that
integration boundary and the measurements that follow it.

[Are We Fast Yet? kernels]: https://github.com/smarr/are-we-fast-yet/tree/74306fec151070fd07157cefeacf19e7e0bcdc89/benchmarks/JavaScript
