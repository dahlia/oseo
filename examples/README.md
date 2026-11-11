Preview demonstrations
======================

These three small programs are original examples under the repository's
license. They use ECMAScript, erasable TypeScript, and the process subset in
[ADR 0038](../docs/adr/0038-process-input-and-exit-subset.md). Node.js,
Deno, and Oseo's native executables run the same source with the same
output. No performance comparison has been measured.

Run from the repository root with the mise-pinned tools. The Deno commands
grant environment variable access for the Node.js-compatible `process`
object. The line matcher and numeric kernel read standard input; none of
the programs reads a filesystem path.

~~~~ sh
mise exec -- node examples/ray-tracer.ts > image.ppm
mise exec -- deno run --allow-env examples/ray-tracer.ts > image.ppm
printf 'one\n\n two\n' | mise exec -- node examples/line-match.ts
printf 'one\n\n two\n' |
  mise exec -- deno run --allow-env examples/line-match.ts
mise exec -- node examples/numeric-hinted.ts < /dev/null
mise exec -- deno run --allow-env examples/numeric-hinted.ts < /dev/null
~~~~


Ray tracer
----------

*ray-tracer.ts* emits an ASCII PPM (`P3`) image of a sphere with a sky
background. It uses one center-sampled camera ray per pixel, sphere
intersection, and surface-normal colors, without randomness or antialiasing.
The default dimensions are 32 by 24. Positional arguments select width and
height, each an integer from 1 through 512; a single width keeps height 24.
Invalid dimensions or extra arguments produce a diagnostic and exit status 2.

This workload exposes floating-point arithmetic, calls to `Math.sqrt()`,
loops, and string construction. A future comparison can use arguments
`160 120` with empty standard input. The 1-by-1 image is exactly
`P3\n1 1\n255\n127 127 255\n`; tests also pin asymmetric sphere colors
and sky colors independently of the implementation.


Line matcher
------------

*line-match.ts* reads UTF-8 standard input and selects lines with a Unicode
regular expression. The pattern and optional label are separate argument
strings; either may contain spaces, and the label may be empty. The default
pattern is `\S`. An explicit label takes precedence over `DEMO_LABEL`, whose
fallback is `matches`.

Output is one JSON object with `label`, `lines` (the input line count), and
`matches` (an array of objects, each with a one-based `line` number and the
original `text` string).
LF and CRLF delimit lines. A final line terminator adds no extra line, an
empty input has zero lines, and interior empty lines remain searchable.
Invalid patterns or extra arguments produce a diagnostic and exit status 2.

This workload exposes input decoding, regular expressions, strings, JSON,
arguments, and environment access. For the fixed future comparison, use
*inputs/lines.txt* as standard input, pass `^눈|error` and `selected` as the
two arguments, and set `DEMO_LABEL=ignored`. The expected JSON value is:

~~~~ json
{
  "label": "selected",
  "lines": 4,
  "matches": [
    { "line": 1, "text": "눈 😀" },
    { "line": 3, "text": "error: example" }
  ]
}
~~~~


Numeric kernel
--------------

*numeric-hinted.ts*, *numeric-unhinted.ts*, and *numeric-wrong-hints.ts*
are three source forms of one batch-addition demo. Their only difference is
the two parameters of `add()`: `number` annotations, no annotations, or
deliberately wrong `string` annotations. Each body is `return a + b;`, so the
number form retains the existing M2 specialization candidate. The wrong
string hints suppress that candidate under the current M2 contract.

Standard input is a JSON array of pairs, with at most 1,024 pairs. Operands
may be JSON numbers, strings, Booleans, or `null`; arrays and objects are
rejected. Empty or whitespace-only input selects `[[1,2],[3,4],[5,6]]`.
The optional argument gives the number of repeated batches, an integer from
1 through 1,000,000, defaulting to 1,000. An empty array is an empty batch.
Invalid input or arguments produce a diagnostic and exit status 2.

Output contains `iterations` and the final batch's `results`. Negative zero
is written as the string `-0` to keep its sign observable through JSON;
other results use ordinary `JSON.stringify()` behavior, including `null`
for non-finite numbers. The default output is
`{"iterations":1000,"results":[3,7,11]}` followed by LF.

This workload exposes repeated function calls and guarded addition, rather
than a broad numerical algorithm. For a future comparison, run every form
with argument `100000`, empty standard input, and expected output
`{"iterations":100000,"results":[3,7,11]}` followed by LF. No timing or
specialization benefit has been measured. The source forms must receive
identical arguments, input, and environment variables.

Run the separate *inputs/numeric-edges.json* input with argument `2`. For
the number form with specialization enabled, its pairs have these fixed
results and intended native path classes:

| Pair                   | Result             | Intended path                     |
| ---------------------- | ------------------ | --------------------------------- |
| `1, 2`                 | `3`                | Small-integer hit                 |
| `140737488355327, 1`   | `140737488355328`  | Positive overflow fallback        |
| `-140737488355328, -1` | `-140737488355329` | Negative overflow fallback        |
| `0.25, 0.5`            | `0.75`             | Noninteger tag miss               |
| `"1", 2`               | `"12"`             | String tag miss and concatenation |
| `"눈", 2`              | `"눈2"`            | Unicode string tag miss           |
| `true, 2`              | `3`                | Boolean tag miss and coercion     |
| `null, 2`              | `2`                | Null tag miss and coercion        |
| `-0, -0`               | `"-0"` in output   | Negative-zero tag miss            |
| `140737488355328, 0`   | `140737488355328`  | Out-of-range operand tag miss     |


Verification
------------

*tests/preview-demos-cases.ts* holds every fixed case: arguments, standard
input, `DEMO_LABEL`, and the exact standard output, standard error, and
exit status. The two ray tracer workloads are pinned by output length and
SHA-256 digest instead of inline text. Two tests run these cases.

*tests/preview-demos.test.ts* imports `node:test` and `node:assert/strict`
directly and runs each program as a subprocess under both Node.js and Deno,
comparing output bytes. `mise run test:node` discovers it, and
`mise run test:deno` names it explicitly. To run it alone under each host:

~~~~ sh
mise exec -- node --test tests/preview-demos.test.ts
mise exec -- deno test -A tests/preview-demos.test.ts
~~~~

The native scenario in *tests/native/scenarios/preview-demos.ts* builds each
program with `oseo build`, with and without `--no-specialization`, and runs
every fixed case against the retained executables. It runs in the second
shard of `mise run test:native` and `mise run test:native:optimized`, so CI
checks both build configurations on Linux AMD64 and macOS AArch64. Every
case except the comparison workloads and the 1,000,000-batch bound runs
with a garbage collection at every safepoint.

The same scenario builds each numeric form a second time with the
compiler's `observeSpecialization` option, in both specialization modes, and
runs the edge input with argument `2`. Property-cache guards share the hit
and miss counters with the `add()` guards, so the scenario compares the
hinted form with the unhinted one under the same mode. With specialization
enabled, the hinted form adds 2 guard hits, 14 tag misses, and 4 overflow
misses, and calls the generic addition 2 times fewer. The unhinted and
string-hinted forms record identical counters in both modes, as do all three
forms with specialization disabled: a string hint suppresses the
specialization rather than missing its guard. The executables that
`oseo build` retains carry no observation counters.
