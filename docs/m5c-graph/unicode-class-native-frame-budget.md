Unicode class native frame budget
=================================

The focused observation on `68b026bb` failed these ten complete pinned
sources at runtime with OSEO2001, “Maximum active native frame budget
exceeded.” Each recorded only the first non-strict variant with
specialization disabled; no pass is inferred for the unreached variants.
The
[raw failures](/data/m5c-b01-b03-b18-20261029/task_b827cc9b95b8/ctx_3dcead5a3eca/semantic-failures.json)
retain the source hashes, exact diagnostics, and execution records.

The initial diagnosis on Main `8f420262` establishes an entry-time frame
charge, rather than an accumulation of active frames. The complete Unicode
10 source declares 8,327 private fields. It emits 49,971 heap-root slots
plus 49,968 units for binding-access C temporaries, charging 99,939 slots
against the unchanged 65,536-slot ceiling before its body runs.

Root authorized registering this prerequisite and admitting the other
944 train paths. That registration added no product fix, failure
reclassification, or exclusion. These ten remain unreviewed under batch 18.


Bounded private-name setup
--------------------------

The implementation gives each `private-name-create` MIR operation its
binding identity. One runtime call creates a fresh lexical cell, installs
it in the current environment, creates the private identity, and initializes
the cell. The runtime roots its environment and cell across allocation.
Those intermediate roots and C temporaries end when the helper returns;
they no longer occupy separate slots in the enclosing generated frame.
The operation still returns a rooted private identity to its caller.

Every evaluation replaces the environment's cell. Existing constructors,
initializers, methods, and accessors retain the previous cells through
their captured environments. Instance and static elements keep distinct
brands, and failed creation retains the original source location. The
helper balances roots on normal, invalid-argument, and allocation-failure
exits. Runtime ABI `m5-142` identifies the new entry point.

The shared ceiling, callable multiplier, general declaration charges,
generic fallbacks, and both specialization policies remain unchanged.
The complete Unicode 10 source now charges 49,977 slots at script entry.
No upstream source, assertion, reviewed subset entry, result, ledger owner,
or graph landed flag changes. The ten paths remain unreviewed under
observation batch 18 until Root's fresh admission.

The source regression records its original failure in
*/data/m5c-d17-20261031/unicode/regression-before.log*. Structural coverage
is in *tests/unicode-class-frame-source.test.ts*. The native subject test
checks the SHA-256 of each entire pinned source and requires all four
strictness/policy variants. The fixed private-name lifetime fixture and
the existing class property family cover repeated evaluations, earlier
captures, private fields/methods/accessors/static elements, brand misses,
false hints, and forced collection. Its new domain uses reserved seed
`0x60000b03`, six ordinary cases and the original replay/shrinking runner.
The runtime environment fixture adds fresh-cell identity, captured-cell
retention, bitmap integrity, both allocation failures, invalid arguments,
source coordinates, and root/frame/call balance under ordinary and forced
collection.

The capacity-wrapped `mise run check` completed with natural exit zero;
*/data/m5c-d17-20261031/unicode/check03.json* records its command and
timestamps. The initial source regression failed before the implementation;
the source regression and backend unit file then passed 27 registrations.
The fixed lifetime source produced identical Node.js and Deno observations.
The ten-source emission audit in *frame-audit.json* records unchanged source
hashes and script charges of 33,603 to 49,977 slots. These are source,
reference, and repository-check results, separate from native execution,
internal review, and Root's D3/full observation requirements.


Focused execution
-----------------

The author checks ran on Linux AMD64. All ten upstream source digests match
the preserved failure packet exactly. Each complete source now passes all
four strictness/policy variants on Zig and on Clang ASan/UBSan, for 80
native variants across the two lanes. No source was shortened or filtered.

The raw command records and outputs live under
*/data/m5c-d17-20261031/unicode/*. The completed vectors are:

| Record                        | Scope                                                                                                           | Result           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------- |
| *zig.json*                    | Whole class property file, runtime bitmap/GC fixture, fixed lifetime fixture, ten originals, source regressions | 31 passed        |
| *sanitizer-self.json*         | Positive runtime/generated-code ASan/UBSan detections and compiler-selection controls                           | 7 passed         |
| *hostcc.json*                 | Runtime fixture, fixed lifetime fixture, ten originals, source regressions                                      | 14 passed        |
| *zig-property-pinned.json*    | Whole class property file after failure-context metadata completion                                             | 17 passed        |
| *hostcc-property-pinned.json* | Same file through the stock ordinary sanitizer property task                                                    | 17 passed        |
| *non-native-pinned.json*      | All 60 fast root-level files, then backend/compiler/parser/runtime package tests                                | 835 + 744 passed |

The stock sanitizer property task retains its default threefold time
allowance. Seeds, draw counts, sizes, shrinkers, replay, and ordinary
property budgets are unchanged apart from the new six-case domain. These
focused checks establish no extended-property, macOS, candidate, or Main
gate result.

Two earlier author-driver failures remain preserved. The first fast run
passed 833 of 835 registrations but failed the unchanged Host Script
Node-reference deletion controls. An isolated run passed all 13 controls.
The detached service's shim path selected Node 24.21 in the repository but
global Node 26.12 in temporary directories; the exact observer program
reproduces the differing outputs in *host-model-node24.stdout* and
*host-model-node26.stdout*. A direct property retry likewise could not
resolve Zig from its temporary build directory. Running the corrected
driver through `mise exec` pins the tool paths for every child; its whole
property and fast/package vectors above completed naturally with exit zero.
No expectation, seed, case count, or language behavior was changed to make
those runs pass.

Internal review and Root's exact-U D3/UPDATE judgment follow the normal-hook
implementation commit. All ten paths still belong to observation batch 18.


Exact reserved paths
--------------------

 -  *test/language/identifiers/start-unicode-10.0.0-class-escaped.js*
 -  *test/language/identifiers/start-unicode-10.0.0-class.js*
 -  *test/language/identifiers/start-unicode-13.0.0-class-escaped.js*
 -  *test/language/identifiers/start-unicode-13.0.0-class.js*
 -  *test/language/identifiers/start-unicode-5.2.0-class-escaped.js*
 -  *test/language/identifiers/start-unicode-5.2.0-class.js*
 -  *test/language/identifiers/start-unicode-8.0.0-class-escaped.js*
 -  *test/language/identifiers/start-unicode-8.0.0-class.js*
 -  *test/language/identifiers/start-unicode-9.0.0-class-escaped.js*
 -  *test/language/identifiers/start-unicode-9.0.0-class.js*
