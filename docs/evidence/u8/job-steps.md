U8 macOS workflow step costs
============================

Measured seconds from GitHub job/step timestamps in each run.
These are historical costs; U8 changed or triggered no workflow.
Skipped conditional steps are omitted. Each job table includes its
measured whole-job duration, including gaps between listed steps.


Run 36243816479 at `00153abe`
-----------------------------

| Source job                            | Step                                                                                                    | Measured s |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------: |
| host C sanitizers (macOS, native)     | Whole job (108409155499)                                                                                |       2404 |
| host C sanitizers (macOS, native)     | `Set up job`                                                                                            |          2 |
| host C sanitizers (macOS, native)     | `Run actions/checkout@v7`                                                                               |          5 |
| host C sanitizers (macOS, native)     | `Run jdx/mise-action@v4`                                                                                |         54 |
| host C sanitizers (macOS, native)     | `Run ./.github/actions/runtime-archive-cache`                                                           |         15 |
| host C sanitizers (macOS, native)     | `Run mise run test:sanitizer:self`                                                                      |          7 |
| host C sanitizers (macOS, native)     | `Run mise run test:sanitizer:runtime`                                                                   |        317 |
| host C sanitizers (macOS, native)     | `Run mise run test:sanitizer:native`                                                                    |       1999 |
| host C sanitizers (macOS, native)     | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| host C sanitizers (macOS, native)     | `Post Run actions/checkout@v7`                                                                          |          1 |
| host C sanitizers (macOS, native)     | `Complete job`                                                                                          |          2 |
| host C sanitizers (macOS, property)   | Whole job (108409155477)                                                                                |       2096 |
| host C sanitizers (macOS, property)   | `Set up job`                                                                                            |          2 |
| host C sanitizers (macOS, property)   | `Run actions/checkout@v7`                                                                               |          3 |
| host C sanitizers (macOS, property)   | `Run jdx/mise-action@v4`                                                                                |         39 |
| host C sanitizers (macOS, property)   | `Run ./.github/actions/runtime-archive-cache`                                                           |          9 |
| host C sanitizers (macOS, property)   | `Run mise run test:sanitizer:self`                                                                      |          5 |
| host C sanitizers (macOS, property)   | `Run mise run test:sanitizer:property`                                                                  |       2031 |
| host C sanitizers (macOS, property)   | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| host C sanitizers (macOS, property)   | `Post Run actions/checkout@v7`                                                                          |          1 |
| host C sanitizers (macOS, property)   | `Complete job`                                                                                          |          2 |
| native (macos-aarch64, 1/3)           | Whole job (108409155521)                                                                                |        990 |
| native (macos-aarch64, 1/3)           | `Set up job`                                                                                            |          2 |
| native (macos-aarch64, 1/3)           | `Run actions/checkout@v7`                                                                               |          3 |
| native (macos-aarch64, 1/3)           | `Run jdx/mise-action@v4`                                                                                |         37 |
| native (macos-aarch64, 1/3)           | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| native (macos-aarch64, 1/3)           | `Run mise run test:native --shard 1/3`                                                                  |        937 |
| native (macos-aarch64, 1/3)           | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native (macos-aarch64, 1/3)           | `Post Run actions/checkout@v7`                                                                          |          0 |
| native (macos-aarch64, 1/3)           | `Complete job`                                                                                          |          0 |
| native (macos-aarch64, 2/3)           | Whole job (108409155536)                                                                                |        725 |
| native (macos-aarch64, 2/3)           | `Set up job`                                                                                            |          1 |
| native (macos-aarch64, 2/3)           | `Run actions/checkout@v7`                                                                               |          3 |
| native (macos-aarch64, 2/3)           | `Run jdx/mise-action@v4`                                                                                |         36 |
| native (macos-aarch64, 2/3)           | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| native (macos-aarch64, 2/3)           | `Run mise run test:native --shard 2/3`                                                                  |        674 |
| native (macos-aarch64, 2/3)           | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native (macos-aarch64, 2/3)           | `Post Run actions/checkout@v7`                                                                          |          1 |
| native (macos-aarch64, 2/3)           | `Complete job`                                                                                          |          0 |
| native (macos-aarch64, 3/3)           | Whole job (108409155599)                                                                                |        824 |
| native (macos-aarch64, 3/3)           | `Set up job`                                                                                            |          2 |
| native (macos-aarch64, 3/3)           | `Run actions/checkout@v7`                                                                               |          4 |
| native (macos-aarch64, 3/3)           | `Run jdx/mise-action@v4`                                                                                |         36 |
| native (macos-aarch64, 3/3)           | `Run ./.github/actions/runtime-archive-cache`                                                           |          4 |
| native (macos-aarch64, 3/3)           | `Run mise run test:native --shard 3/3`                                                                  |        775 |
| native (macos-aarch64, 3/3)           | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native (macos-aarch64, 3/3)           | `Post Run actions/checkout@v7`                                                                          |          1 |
| native (macos-aarch64, 3/3)           | `Complete job`                                                                                          |          1 |
| native support (macos-aarch64, 1/12)  | Whole job (108409155577)                                                                                |       1301 |
| native support (macos-aarch64, 1/12)  | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 1/12)  | `Run actions/checkout@v7`                                                                               |          8 |
| native support (macos-aarch64, 1/12)  | `Run jdx/mise-action@v4`                                                                                |         36 |
| native support (macos-aarch64, 1/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          7 |
| native support (macos-aarch64, 1/12)  | `Run mise run test:property:extended:package`                                                           |         11 |
| native support (macos-aarch64, 1/12)  | `Run mise run test:property:extended:native:shard --test-shard=1/12 tests/property/*.property.test.ts`  |       1231 |
| native support (macos-aarch64, 1/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native support (macos-aarch64, 1/12)  | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 1/12)  | `Complete job`                                                                                          |          1 |
| native support (macos-aarch64, 10/12) | Whole job (108409155596)                                                                                |       1245 |
| native support (macos-aarch64, 10/12) | `Set up job`                                                                                            |          1 |
| native support (macos-aarch64, 10/12) | `Run actions/checkout@v7`                                                                               |          4 |
| native support (macos-aarch64, 10/12) | `Run jdx/mise-action@v4`                                                                                |         38 |
| native support (macos-aarch64, 10/12) | `Run ./.github/actions/runtime-archive-cache`                                                           |          5 |
| native support (macos-aarch64, 10/12) | `Run mise run test:property:extended:native:shard --test-shard=10/12 tests/property/*.property.test.ts` |       1191 |
| native support (macos-aarch64, 10/12) | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native support (macos-aarch64, 10/12) | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 10/12) | `Complete job`                                                                                          |          2 |
| native support (macos-aarch64, 11/12) | Whole job (108409155646)                                                                                |        916 |
| native support (macos-aarch64, 11/12) | `Set up job`                                                                                            |          1 |
| native support (macos-aarch64, 11/12) | `Run actions/checkout@v7`                                                                               |          3 |
| native support (macos-aarch64, 11/12) | `Run jdx/mise-action@v4`                                                                                |         29 |
| native support (macos-aarch64, 11/12) | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| native support (macos-aarch64, 11/12) | `Run mise run test:property:extended:native:shard --test-shard=11/12 tests/property/*.property.test.ts` |        871 |
| native support (macos-aarch64, 11/12) | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native support (macos-aarch64, 11/12) | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 11/12) | `Complete job`                                                                                          |          1 |
| native support (macos-aarch64, 12/12) | Whole job (108409155587)                                                                                |       1111 |
| native support (macos-aarch64, 12/12) | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 12/12) | `Run actions/checkout@v7`                                                                               |          3 |
| native support (macos-aarch64, 12/12) | `Run jdx/mise-action@v4`                                                                                |         40 |
| native support (macos-aarch64, 12/12) | `Run ./.github/actions/runtime-archive-cache`                                                           |          4 |
| native support (macos-aarch64, 12/12) | `Run mise run test:property:extended:native:shard --test-shard=12/12 tests/property/*.property.test.ts` |       1057 |
| native support (macos-aarch64, 12/12) | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native support (macos-aarch64, 12/12) | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 12/12) | `Complete job`                                                                                          |          2 |
| native support (macos-aarch64, 2/12)  | Whole job (108409155515)                                                                                |       1449 |
| native support (macos-aarch64, 2/12)  | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 2/12)  | `Run actions/checkout@v7`                                                                               |          5 |
| native support (macos-aarch64, 2/12)  | `Run jdx/mise-action@v4`                                                                                |         46 |
| native support (macos-aarch64, 2/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          7 |
| native support (macos-aarch64, 2/12)  | `Run mise run test:property:extended:native:shard --test-shard=2/12 tests/property/*.property.test.ts`  |       1384 |
| native support (macos-aarch64, 2/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native support (macos-aarch64, 2/12)  | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 2/12)  | `Complete job`                                                                                          |          0 |
| native support (macos-aarch64, 3/12)  | Whole job (108409155559)                                                                                |       1636 |
| native support (macos-aarch64, 3/12)  | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 3/12)  | `Run actions/checkout@v7`                                                                               |          3 |
| native support (macos-aarch64, 3/12)  | `Run jdx/mise-action@v4`                                                                                |         30 |
| native support (macos-aarch64, 3/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          3 |
| native support (macos-aarch64, 3/12)  | `Run mise run test:property:extended:native:shard --test-shard=3/12 tests/property/*.property.test.ts`  |       1597 |
| native support (macos-aarch64, 3/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native support (macos-aarch64, 3/12)  | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 3/12)  | `Complete job`                                                                                          |          0 |
| native support (macos-aarch64, 4/12)  | Whole job (108409155507)                                                                                |       1930 |
| native support (macos-aarch64, 4/12)  | `Set up job`                                                                                            |          1 |
| native support (macos-aarch64, 4/12)  | `Run actions/checkout@v7`                                                                               |          4 |
| native support (macos-aarch64, 4/12)  | `Run jdx/mise-action@v4`                                                                                |         41 |
| native support (macos-aarch64, 4/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| native support (macos-aarch64, 4/12)  | `Run mise run test:property:extended:native:shard --test-shard=4/12 tests/property/*.property.test.ts`  |       1870 |
| native support (macos-aarch64, 4/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          2 |
| native support (macos-aarch64, 4/12)  | `Post Run actions/checkout@v7`                                                                          |          0 |
| native support (macos-aarch64, 4/12)  | `Complete job`                                                                                          |          4 |
| native support (macos-aarch64, 5/12)  | Whole job (108409155582)                                                                                |       4088 |
| native support (macos-aarch64, 5/12)  | `Set up job`                                                                                            |          3 |
| native support (macos-aarch64, 5/12)  | `Run actions/checkout@v7`                                                                               |          4 |
| native support (macos-aarch64, 5/12)  | `Run jdx/mise-action@v4`                                                                                |         38 |
| native support (macos-aarch64, 5/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          4 |
| native support (macos-aarch64, 5/12)  | `Run mise run test:property:extended:native:shard --test-shard=5/12 tests/property/*.property.test.ts`  |       4031 |
| native support (macos-aarch64, 5/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native support (macos-aarch64, 5/12)  | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 5/12)  | `Complete job`                                                                                          |          4 |
| native support (macos-aarch64, 6/12)  | Whole job (108409155597)                                                                                |       1548 |
| native support (macos-aarch64, 6/12)  | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 6/12)  | `Run actions/checkout@v7`                                                                               |          5 |
| native support (macos-aarch64, 6/12)  | `Run jdx/mise-action@v4`                                                                                |         43 |
| native support (macos-aarch64, 6/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| native support (macos-aarch64, 6/12)  | `Run mise run test:property:extended:native:shard --test-shard=6/12 tests/property/*.property.test.ts`  |       1488 |
| native support (macos-aarch64, 6/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native support (macos-aarch64, 6/12)  | `Post Run actions/checkout@v7`                                                                          |          0 |
| native support (macos-aarch64, 6/12)  | `Complete job`                                                                                          |          1 |
| native support (macos-aarch64, 7/12)  | Whole job (108409155527)                                                                                |       1216 |
| native support (macos-aarch64, 7/12)  | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 7/12)  | `Run actions/checkout@v7`                                                                               |          3 |
| native support (macos-aarch64, 7/12)  | `Run jdx/mise-action@v4`                                                                                |         31 |
| native support (macos-aarch64, 7/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          3 |
| native support (macos-aarch64, 7/12)  | `Run mise run test:property:extended:native:shard --test-shard=7/12 tests/property/*.property.test.ts`  |       1174 |
| native support (macos-aarch64, 7/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native support (macos-aarch64, 7/12)  | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 7/12)  | `Complete job`                                                                                          |          0 |
| native support (macos-aarch64, 8/12)  | Whole job (108409155548)                                                                                |       1140 |
| native support (macos-aarch64, 8/12)  | `Set up job`                                                                                            |          1 |
| native support (macos-aarch64, 8/12)  | `Run actions/checkout@v7`                                                                               |          4 |
| native support (macos-aarch64, 8/12)  | `Run jdx/mise-action@v4`                                                                                |         38 |
| native support (macos-aarch64, 8/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          5 |
| native support (macos-aarch64, 8/12)  | `Run mise run test:property:extended:native:shard --test-shard=8/12 tests/property/*.property.test.ts`  |       1086 |
| native support (macos-aarch64, 8/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native support (macos-aarch64, 8/12)  | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 8/12)  | `Complete job`                                                                                          |          1 |
| native support (macos-aarch64, 9/12)  | Whole job (108409155541)                                                                                |       1032 |
| native support (macos-aarch64, 9/12)  | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 9/12)  | `Run actions/checkout@v7`                                                                               |          4 |
| native support (macos-aarch64, 9/12)  | `Run jdx/mise-action@v4`                                                                                |         43 |
| native support (macos-aarch64, 9/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          5 |
| native support (macos-aarch64, 9/12)  | `Run mise run test:property:extended:native:shard --test-shard=9/12 tests/property/*.property.test.ts`  |        971 |
| native support (macos-aarch64, 9/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          2 |
| native support (macos-aarch64, 9/12)  | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 9/12)  | `Complete job`                                                                                          |          2 |
| test (macos-latest, deno)             | Whole job (108409155533)                                                                                |         90 |
| test (macos-latest, deno)             | `Set up job`                                                                                            |          1 |
| test (macos-latest, deno)             | `Run actions/checkout@v7`                                                                               |          3 |
| test (macos-latest, deno)             | `Run jdx/mise-action@v4`                                                                                |         39 |
| test (macos-latest, deno)             | `Run ./.github/actions/runtime-archive-cache`                                                           |          3 |
| test (macos-latest, deno)             | `Run mise run test:deno`                                                                                |         38 |
| test (macos-latest, deno)             | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test (macos-latest, deno)             | `Post Run actions/checkout@v7`                                                                          |          0 |
| test (macos-latest, deno)             | `Complete job`                                                                                          |          0 |
| test (macos-latest, node)             | Whole job (108409155552)                                                                                |       2421 |
| test (macos-latest, node)             | `Set up job`                                                                                            |          1 |
| test (macos-latest, node)             | `Run actions/checkout@v7`                                                                               |          4 |
| test (macos-latest, node)             | `Run jdx/mise-action@v4`                                                                                |         39 |
| test (macos-latest, node)             | `Run ./.github/actions/runtime-archive-cache`                                                           |          4 |
| test (macos-latest, node)             | `Run mise run test:node`                                                                                |       2368 |
| test (macos-latest, node)             | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test (macos-latest, node)             | `Post Run actions/checkout@v7`                                                                          |          1 |
| test (macos-latest, node)             | `Complete job`                                                                                          |          2 |
| test262 (macos-aarch64, 1/10)         | Whole job (108409155660)                                                                                |       1726 |
| test262 (macos-aarch64, 1/10)         | `Set up job`                                                                                            |          2 |
| test262 (macos-aarch64, 1/10)         | `Run actions/checkout@v7`                                                                               |          5 |
| test262 (macos-aarch64, 1/10)         | `Run jdx/mise-action@v4`                                                                                |         47 |
| test262 (macos-aarch64, 1/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| test262 (macos-aarch64, 1/10)         | `Run mise run test:test262 --shard 1/10`                                                                |       1661 |
| test262 (macos-aarch64, 1/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test262 (macos-aarch64, 1/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 1/10)         | `Complete job`                                                                                          |          1 |
| test262 (macos-aarch64, 10/10)        | Whole job (108409155669)                                                                                |       1636 |
| test262 (macos-aarch64, 10/10)        | `Set up job`                                                                                            |          2 |
| test262 (macos-aarch64, 10/10)        | `Run actions/checkout@v7`                                                                               |          3 |
| test262 (macos-aarch64, 10/10)        | `Run jdx/mise-action@v4`                                                                                |         32 |
| test262 (macos-aarch64, 10/10)        | `Run ./.github/actions/runtime-archive-cache`                                                           |          5 |
| test262 (macos-aarch64, 10/10)        | `Run mise run test:test262 --shard 10/10`                                                               |       1587 |
| test262 (macos-aarch64, 10/10)        | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test262 (macos-aarch64, 10/10)        | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 10/10)        | `Complete job`                                                                                          |          2 |
| test262 (macos-aarch64, 2/10)         | Whole job (108409155714)                                                                                |       1680 |
| test262 (macos-aarch64, 2/10)         | `Set up job`                                                                                            |          2 |
| test262 (macos-aarch64, 2/10)         | `Run actions/checkout@v7`                                                                               |          3 |
| test262 (macos-aarch64, 2/10)         | `Run jdx/mise-action@v4`                                                                                |         43 |
| test262 (macos-aarch64, 2/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          5 |
| test262 (macos-aarch64, 2/10)         | `Run mise run test:test262 --shard 2/10`                                                                |       1619 |
| test262 (macos-aarch64, 2/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| test262 (macos-aarch64, 2/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 2/10)         | `Complete job`                                                                                          |          5 |
| test262 (macos-aarch64, 3/10)         | Whole job (108409155512)                                                                                |       1930 |
| test262 (macos-aarch64, 3/10)         | `Set up job`                                                                                            |          2 |
| test262 (macos-aarch64, 3/10)         | `Run actions/checkout@v7`                                                                               |          5 |
| test262 (macos-aarch64, 3/10)         | `Run jdx/mise-action@v4`                                                                                |         47 |
| test262 (macos-aarch64, 3/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| test262 (macos-aarch64, 3/10)         | `Run mise run test:test262 --shard 3/10`                                                                |       1864 |
| test262 (macos-aarch64, 3/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test262 (macos-aarch64, 3/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 3/10)         | `Complete job`                                                                                          |          1 |
| test262 (macos-aarch64, 4/10)         | Whole job (108409155693)                                                                                |       2023 |
| test262 (macos-aarch64, 4/10)         | `Set up job`                                                                                            |          2 |
| test262 (macos-aarch64, 4/10)         | `Run actions/checkout@v7`                                                                               |          5 |
| test262 (macos-aarch64, 4/10)         | `Run jdx/mise-action@v4`                                                                                |         43 |
| test262 (macos-aarch64, 4/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| test262 (macos-aarch64, 4/10)         | `Run mise run test:test262 --shard 4/10`                                                                |       1960 |
| test262 (macos-aarch64, 4/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test262 (macos-aarch64, 4/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 4/10)         | `Complete job`                                                                                          |          2 |
| test262 (macos-aarch64, 5/10)         | Whole job (108409155679)                                                                                |       2636 |
| test262 (macos-aarch64, 5/10)         | `Set up job`                                                                                            |          2 |
| test262 (macos-aarch64, 5/10)         | `Run actions/checkout@v7`                                                                               |          6 |
| test262 (macos-aarch64, 5/10)         | `Run jdx/mise-action@v4`                                                                                |         58 |
| test262 (macos-aarch64, 5/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          9 |
| test262 (macos-aarch64, 5/10)         | `Run mise run test:test262 --shard 5/10`                                                                |       2553 |
| test262 (macos-aarch64, 5/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test262 (macos-aarch64, 5/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 5/10)         | `Complete job`                                                                                          |          2 |
| test262 (macos-aarch64, 6/10)         | Whole job (108409155642)                                                                                |       2004 |
| test262 (macos-aarch64, 6/10)         | `Set up job`                                                                                            |          1 |
| test262 (macos-aarch64, 6/10)         | `Run actions/checkout@v7`                                                                               |          5 |
| test262 (macos-aarch64, 6/10)         | `Run jdx/mise-action@v4`                                                                                |         41 |
| test262 (macos-aarch64, 6/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          5 |
| test262 (macos-aarch64, 6/10)         | `Run mise run test:test262 --shard 6/10`                                                                |       1945 |
| test262 (macos-aarch64, 6/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| test262 (macos-aarch64, 6/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 6/10)         | `Complete job`                                                                                          |          4 |
| test262 (macos-aarch64, 7/10)         | Whole job (108409155700)                                                                                |       2030 |
| test262 (macos-aarch64, 7/10)         | `Set up job`                                                                                            |          2 |
| test262 (macos-aarch64, 7/10)         | `Run actions/checkout@v7`                                                                               |          4 |
| test262 (macos-aarch64, 7/10)         | `Run jdx/mise-action@v4`                                                                                |         45 |
| test262 (macos-aarch64, 7/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          7 |
| test262 (macos-aarch64, 7/10)         | `Run mise run test:test262 --shard 7/10`                                                                |       1966 |
| test262 (macos-aarch64, 7/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test262 (macos-aarch64, 7/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 7/10)         | `Complete job`                                                                                          |          0 |
| test262 (macos-aarch64, 8/10)         | Whole job (108409155661)                                                                                |       1945 |
| test262 (macos-aarch64, 8/10)         | `Set up job`                                                                                            |          1 |
| test262 (macos-aarch64, 8/10)         | `Run actions/checkout@v7`                                                                               |          3 |
| test262 (macos-aarch64, 8/10)         | `Run jdx/mise-action@v4`                                                                                |         38 |
| test262 (macos-aarch64, 8/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| test262 (macos-aarch64, 8/10)         | `Run mise run test:test262 --shard 8/10`                                                                |       1888 |
| test262 (macos-aarch64, 8/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test262 (macos-aarch64, 8/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 8/10)         | `Complete job`                                                                                          |          4 |
| test262 (macos-aarch64, 9/10)         | Whole job (108409155696)                                                                                |       1955 |
| test262 (macos-aarch64, 9/10)         | `Set up job`                                                                                            |          1 |
| test262 (macos-aarch64, 9/10)         | `Run actions/checkout@v7`                                                                               |          4 |
| test262 (macos-aarch64, 9/10)         | `Run jdx/mise-action@v4`                                                                                |         43 |
| test262 (macos-aarch64, 9/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          8 |
| test262 (macos-aarch64, 9/10)         | `Run mise run test:test262 --shard 9/10`                                                                |       1892 |
| test262 (macos-aarch64, 9/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test262 (macos-aarch64, 9/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 9/10)         | `Complete job`                                                                                          |          2 |


Run 36261458909 at `c9b3cc80`
-----------------------------

| Source job                            | Step                                                                                                    | Measured s |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------: |
| host C sanitizers (macOS, native)     | Whole job (108457960695)                                                                                |       2151 |
| host C sanitizers (macOS, native)     | `Set up job`                                                                                            |          2 |
| host C sanitizers (macOS, native)     | `Run actions/checkout@v7`                                                                               |          4 |
| host C sanitizers (macOS, native)     | `Run jdx/mise-action@v4`                                                                                |         39 |
| host C sanitizers (macOS, native)     | `Run ./.github/actions/runtime-archive-cache`                                                           |         10 |
| host C sanitizers (macOS, native)     | `Run mise run test:sanitizer:self`                                                                      |          7 |
| host C sanitizers (macOS, native)     | `Run mise run test:sanitizer:runtime`                                                                   |        273 |
| host C sanitizers (macOS, native)     | `Run mise run test:sanitizer:native`                                                                    |       1810 |
| host C sanitizers (macOS, native)     | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          2 |
| host C sanitizers (macOS, native)     | `Post Run actions/checkout@v7`                                                                          |          1 |
| host C sanitizers (macOS, native)     | `Complete job`                                                                                          |          0 |
| host C sanitizers (macOS, property)   | Whole job (108457960702)                                                                                |       1875 |
| host C sanitizers (macOS, property)   | `Set up job`                                                                                            |          2 |
| host C sanitizers (macOS, property)   | `Run actions/checkout@v7`                                                                               |          4 |
| host C sanitizers (macOS, property)   | `Run jdx/mise-action@v4`                                                                                |         27 |
| host C sanitizers (macOS, property)   | `Run ./.github/actions/runtime-archive-cache`                                                           |          9 |
| host C sanitizers (macOS, property)   | `Run mise run test:sanitizer:self`                                                                      |          5 |
| host C sanitizers (macOS, property)   | `Run mise run test:sanitizer:property`                                                                  |       1823 |
| host C sanitizers (macOS, property)   | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| host C sanitizers (macOS, property)   | `Post Run actions/checkout@v7`                                                                          |          1 |
| host C sanitizers (macOS, property)   | `Complete job`                                                                                          |          2 |
| native (macos-aarch64, 1/3)           | Whole job (108457960797)                                                                                |        704 |
| native (macos-aarch64, 1/3)           | `Set up job`                                                                                            |          1 |
| native (macos-aarch64, 1/3)           | `Run actions/checkout@v7`                                                                               |          3 |
| native (macos-aarch64, 1/3)           | `Run jdx/mise-action@v4`                                                                                |         27 |
| native (macos-aarch64, 1/3)           | `Run ./.github/actions/runtime-archive-cache`                                                           |          4 |
| native (macos-aarch64, 1/3)           | `Run mise run test:native --shard 1/3`                                                                  |        663 |
| native (macos-aarch64, 1/3)           | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native (macos-aarch64, 1/3)           | `Post Run actions/checkout@v7`                                                                          |          1 |
| native (macos-aarch64, 1/3)           | `Complete job`                                                                                          |          1 |
| native (macos-aarch64, 2/3)           | Whole job (108457960803)                                                                                |       1045 |
| native (macos-aarch64, 2/3)           | `Set up job`                                                                                            |          1 |
| native (macos-aarch64, 2/3)           | `Run actions/checkout@v7`                                                                               |          3 |
| native (macos-aarch64, 2/3)           | `Run jdx/mise-action@v4`                                                                                |         37 |
| native (macos-aarch64, 2/3)           | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| native (macos-aarch64, 2/3)           | `Run mise run test:native --shard 2/3`                                                                  |        991 |
| native (macos-aarch64, 2/3)           | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native (macos-aarch64, 2/3)           | `Post Run actions/checkout@v7`                                                                          |          1 |
| native (macos-aarch64, 2/3)           | `Complete job`                                                                                          |          2 |
| native (macos-aarch64, 3/3)           | Whole job (108457960750)                                                                                |        986 |
| native (macos-aarch64, 3/3)           | `Set up job`                                                                                            |          1 |
| native (macos-aarch64, 3/3)           | `Run actions/checkout@v7`                                                                               |          5 |
| native (macos-aarch64, 3/3)           | `Run jdx/mise-action@v4`                                                                                |         42 |
| native (macos-aarch64, 3/3)           | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| native (macos-aarch64, 3/3)           | `Run mise run test:native --shard 3/3`                                                                  |        928 |
| native (macos-aarch64, 3/3)           | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native (macos-aarch64, 3/3)           | `Post Run actions/checkout@v7`                                                                          |          1 |
| native (macos-aarch64, 3/3)           | `Complete job`                                                                                          |          1 |
| native support (macos-aarch64, 1/12)  | Whole job (108457960760)                                                                                |       1242 |
| native support (macos-aarch64, 1/12)  | `Set up job`                                                                                            |          1 |
| native support (macos-aarch64, 1/12)  | `Run actions/checkout@v7`                                                                               |          4 |
| native support (macos-aarch64, 1/12)  | `Run jdx/mise-action@v4`                                                                                |         32 |
| native support (macos-aarch64, 1/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          4 |
| native support (macos-aarch64, 1/12)  | `Run mise run test:property:extended:package`                                                           |         10 |
| native support (macos-aarch64, 1/12)  | `Run mise run test:property:extended:native:shard --test-shard=1/12 tests/property/*.property.test.ts`  |       1186 |
| native support (macos-aarch64, 1/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native support (macos-aarch64, 1/12)  | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 1/12)  | `Complete job`                                                                                          |          1 |
| native support (macos-aarch64, 10/12) | Whole job (108457960871)                                                                                |       1398 |
| native support (macos-aarch64, 10/12) | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 10/12) | `Run actions/checkout@v7`                                                                               |          3 |
| native support (macos-aarch64, 10/12) | `Run jdx/mise-action@v4`                                                                                |         46 |
| native support (macos-aarch64, 10/12) | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| native support (macos-aarch64, 10/12) | `Run mise run test:property:extended:native:shard --test-shard=10/12 tests/property/*.property.test.ts` |       1334 |
| native support (macos-aarch64, 10/12) | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native support (macos-aarch64, 10/12) | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 10/12) | `Complete job`                                                                                          |          1 |
| native support (macos-aarch64, 11/12) | Whole job (108457960824)                                                                                |        722 |
| native support (macos-aarch64, 11/12) | `Set up job`                                                                                            |          1 |
| native support (macos-aarch64, 11/12) | `Run actions/checkout@v7`                                                                               |          4 |
| native support (macos-aarch64, 11/12) | `Run jdx/mise-action@v4`                                                                                |         34 |
| native support (macos-aarch64, 11/12) | `Run ./.github/actions/runtime-archive-cache`                                                           |          5 |
| native support (macos-aarch64, 11/12) | `Run mise run test:property:extended:native:shard --test-shard=11/12 tests/property/*.property.test.ts` |        674 |
| native support (macos-aarch64, 11/12) | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native support (macos-aarch64, 11/12) | `Post Run actions/checkout@v7`                                                                          |          0 |
| native support (macos-aarch64, 11/12) | `Complete job`                                                                                          |          2 |
| native support (macos-aarch64, 12/12) | Whole job (108457960818)                                                                                |       1116 |
| native support (macos-aarch64, 12/12) | `Set up job`                                                                                            |          1 |
| native support (macos-aarch64, 12/12) | `Run actions/checkout@v7`                                                                               |          4 |
| native support (macos-aarch64, 12/12) | `Run jdx/mise-action@v4`                                                                                |         33 |
| native support (macos-aarch64, 12/12) | `Run ./.github/actions/runtime-archive-cache`                                                           |          4 |
| native support (macos-aarch64, 12/12) | `Run mise run test:property:extended:native:shard --test-shard=12/12 tests/property/*.property.test.ts` |       1069 |
| native support (macos-aarch64, 12/12) | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native support (macos-aarch64, 12/12) | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 12/12) | `Complete job`                                                                                          |          1 |
| native support (macos-aarch64, 2/12)  | Whole job (108457960753)                                                                                |       1319 |
| native support (macos-aarch64, 2/12)  | `Set up job`                                                                                            |          1 |
| native support (macos-aarch64, 2/12)  | `Run actions/checkout@v7`                                                                               |          4 |
| native support (macos-aarch64, 2/12)  | `Run jdx/mise-action@v4`                                                                                |         37 |
| native support (macos-aarch64, 2/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          7 |
| native support (macos-aarch64, 2/12)  | `Run mise run test:property:extended:native:shard --test-shard=2/12 tests/property/*.property.test.ts`  |       1265 |
| native support (macos-aarch64, 2/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native support (macos-aarch64, 2/12)  | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 2/12)  | `Complete job`                                                                                          |          2 |
| native support (macos-aarch64, 3/12)  | Whole job (108457960772)                                                                                |       2341 |
| native support (macos-aarch64, 3/12)  | `Set up job`                                                                                            |          1 |
| native support (macos-aarch64, 3/12)  | `Run actions/checkout@v7`                                                                               |          4 |
| native support (macos-aarch64, 3/12)  | `Run jdx/mise-action@v4`                                                                                |         38 |
| native support (macos-aarch64, 3/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| native support (macos-aarch64, 3/12)  | `Run mise run test:property:extended:native:shard --test-shard=3/12 tests/property/*.property.test.ts`  |       2287 |
| native support (macos-aarch64, 3/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native support (macos-aarch64, 3/12)  | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 3/12)  | `Complete job`                                                                                          |          0 |
| native support (macos-aarch64, 4/12)  | Whole job (108457960741)                                                                                |       1723 |
| native support (macos-aarch64, 4/12)  | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 4/12)  | `Run actions/checkout@v7`                                                                               |          4 |
| native support (macos-aarch64, 4/12)  | `Run jdx/mise-action@v4`                                                                                |         41 |
| native support (macos-aarch64, 4/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          4 |
| native support (macos-aarch64, 4/12)  | `Run mise run test:property:extended:native:shard --test-shard=4/12 tests/property/*.property.test.ts`  |       1668 |
| native support (macos-aarch64, 4/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native support (macos-aarch64, 4/12)  | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 4/12)  | `Complete job`                                                                                          |          0 |
| native support (macos-aarch64, 5/12)  | Whole job (108457960771)                                                                                |       3095 |
| native support (macos-aarch64, 5/12)  | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 5/12)  | `Run actions/checkout@v7`                                                                               |          3 |
| native support (macos-aarch64, 5/12)  | `Run jdx/mise-action@v4`                                                                                |         32 |
| native support (macos-aarch64, 5/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| native support (macos-aarch64, 5/12)  | `Run mise run test:property:extended:native:shard --test-shard=5/12 tests/property/*.property.test.ts`  |       3047 |
| native support (macos-aarch64, 5/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native support (macos-aarch64, 5/12)  | `Post Run actions/checkout@v7`                                                                          |          0 |
| native support (macos-aarch64, 5/12)  | `Complete job`                                                                                          |          2 |
| native support (macos-aarch64, 6/12)  | Whole job (108457960812)                                                                                |       1130 |
| native support (macos-aarch64, 6/12)  | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 6/12)  | `Run actions/checkout@v7`                                                                               |          4 |
| native support (macos-aarch64, 6/12)  | `Run jdx/mise-action@v4`                                                                                |         31 |
| native support (macos-aarch64, 6/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          5 |
| native support (macos-aarch64, 6/12)  | `Run mise run test:property:extended:native:shard --test-shard=6/12 tests/property/*.property.test.ts`  |       1084 |
| native support (macos-aarch64, 6/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native support (macos-aarch64, 6/12)  | `Post Run actions/checkout@v7`                                                                          |          0 |
| native support (macos-aarch64, 6/12)  | `Complete job`                                                                                          |          1 |
| native support (macos-aarch64, 7/12)  | Whole job (108457960758)                                                                                |       1283 |
| native support (macos-aarch64, 7/12)  | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 7/12)  | `Run actions/checkout@v7`                                                                               |          4 |
| native support (macos-aarch64, 7/12)  | `Run jdx/mise-action@v4`                                                                                |         37 |
| native support (macos-aarch64, 7/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          5 |
| native support (macos-aarch64, 7/12)  | `Run mise run test:property:extended:native:shard --test-shard=7/12 tests/property/*.property.test.ts`  |       1230 |
| native support (macos-aarch64, 7/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native support (macos-aarch64, 7/12)  | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 7/12)  | `Complete job`                                                                                          |          1 |
| native support (macos-aarch64, 8/12)  | Whole job (108457960845)                                                                                |        958 |
| native support (macos-aarch64, 8/12)  | `Set up job`                                                                                            |          1 |
| native support (macos-aarch64, 8/12)  | `Run actions/checkout@v7`                                                                               |          3 |
| native support (macos-aarch64, 8/12)  | `Run jdx/mise-action@v4`                                                                                |         36 |
| native support (macos-aarch64, 8/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| native support (macos-aarch64, 8/12)  | `Run mise run test:property:extended:native:shard --test-shard=8/12 tests/property/*.property.test.ts`  |        907 |
| native support (macos-aarch64, 8/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native support (macos-aarch64, 8/12)  | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 8/12)  | `Complete job`                                                                                          |          2 |
| native support (macos-aarch64, 9/12)  | Whole job (108457960811)                                                                                |        764 |
| native support (macos-aarch64, 9/12)  | `Set up job`                                                                                            |          1 |
| native support (macos-aarch64, 9/12)  | `Run actions/checkout@v7`                                                                               |          3 |
| native support (macos-aarch64, 9/12)  | `Run jdx/mise-action@v4`                                                                                |         28 |
| native support (macos-aarch64, 9/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          4 |
| native support (macos-aarch64, 9/12)  | `Run mise run test:property:extended:native:shard --test-shard=9/12 tests/property/*.property.test.ts`  |        723 |
| native support (macos-aarch64, 9/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native support (macos-aarch64, 9/12)  | `Post Run actions/checkout@v7`                                                                          |          0 |
| native support (macos-aarch64, 9/12)  | `Complete job`                                                                                          |          2 |
| test (macos-latest, deno)             | Whole job (108457960713)                                                                                |        182 |
| test (macos-latest, deno)             | `Set up job`                                                                                            |          1 |
| test (macos-latest, deno)             | `Run actions/checkout@v7`                                                                               |          5 |
| test (macos-latest, deno)             | `Run jdx/mise-action@v4`                                                                                |         38 |
| test (macos-latest, deno)             | `Run ./.github/actions/runtime-archive-cache`                                                           |          4 |
| test (macos-latest, deno)             | `Run mise run test:deno`                                                                                |         47 |
| test (macos-latest, deno)             | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test (macos-latest, deno)             | `Post Run actions/checkout@v7`                                                                          |          1 |
| test (macos-latest, deno)             | `Complete job`                                                                                          |          2 |
| test (macos-latest, node)             | Whole job (108457960817)                                                                                |       2589 |
| test (macos-latest, node)             | `Set up job`                                                                                            |          2 |
| test (macos-latest, node)             | `Run actions/checkout@v7`                                                                               |          4 |
| test (macos-latest, node)             | `Run jdx/mise-action@v4`                                                                                |         40 |
| test (macos-latest, node)             | `Run ./.github/actions/runtime-archive-cache`                                                           |          3 |
| test (macos-latest, node)             | `Run mise run test:node`                                                                                |       2537 |
| test (macos-latest, node)             | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test (macos-latest, node)             | `Post Run actions/checkout@v7`                                                                          |          0 |
| test (macos-latest, node)             | `Complete job`                                                                                          |          1 |
| test262 (macos-aarch64, 1/10)         | Whole job (108457960962)                                                                                |       1954 |
| test262 (macos-aarch64, 1/10)         | `Set up job`                                                                                            |          1 |
| test262 (macos-aarch64, 1/10)         | `Run actions/checkout@v7`                                                                               |          3 |
| test262 (macos-aarch64, 1/10)         | `Run jdx/mise-action@v4`                                                                                |         31 |
| test262 (macos-aarch64, 1/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          5 |
| test262 (macos-aarch64, 1/10)         | `Run mise run test:test262 --shard 1/10`                                                                |       1908 |
| test262 (macos-aarch64, 1/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| test262 (macos-aarch64, 1/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 1/10)         | `Complete job`                                                                                          |          2 |
| test262 (macos-aarch64, 10/10)        | Whole job (108457960777)                                                                                |       1752 |
| test262 (macos-aarch64, 10/10)        | `Set up job`                                                                                            |          2 |
| test262 (macos-aarch64, 10/10)        | `Run actions/checkout@v7`                                                                               |          5 |
| test262 (macos-aarch64, 10/10)        | `Run jdx/mise-action@v4`                                                                                |         40 |
| test262 (macos-aarch64, 10/10)        | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| test262 (macos-aarch64, 10/10)        | `Run mise run test:test262 --shard 10/10`                                                               |       1695 |
| test262 (macos-aarch64, 10/10)        | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test262 (macos-aarch64, 10/10)        | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 10/10)        | `Complete job`                                                                                          |          1 |
| test262 (macos-aarch64, 2/10)         | Whole job (108457960923)                                                                                |       1701 |
| test262 (macos-aarch64, 2/10)         | `Set up job`                                                                                            |          4 |
| test262 (macos-aarch64, 2/10)         | `Run actions/checkout@v7`                                                                               |          6 |
| test262 (macos-aarch64, 2/10)         | `Run jdx/mise-action@v4`                                                                                |         44 |
| test262 (macos-aarch64, 2/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          7 |
| test262 (macos-aarch64, 2/10)         | `Run mise run test:test262 --shard 2/10`                                                                |       1633 |
| test262 (macos-aarch64, 2/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test262 (macos-aarch64, 2/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 2/10)         | `Complete job`                                                                                          |          2 |
| test262 (macos-aarch64, 3/10)         | Whole job (108457960799)                                                                                |       2750 |
| test262 (macos-aarch64, 3/10)         | `Set up job`                                                                                            |          2 |
| test262 (macos-aarch64, 3/10)         | `Run actions/checkout@v7`                                                                               |          5 |
| test262 (macos-aarch64, 3/10)         | `Run jdx/mise-action@v4`                                                                                |         45 |
| test262 (macos-aarch64, 3/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          7 |
| test262 (macos-aarch64, 3/10)         | `Run mise run test:test262 --shard 3/10`                                                                |       2682 |
| test262 (macos-aarch64, 3/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test262 (macos-aarch64, 3/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 3/10)         | `Complete job`                                                                                          |          4 |
| test262 (macos-aarch64, 4/10)         | Whole job (108457960954)                                                                                |       1802 |
| test262 (macos-aarch64, 4/10)         | `Set up job`                                                                                            |          1 |
| test262 (macos-aarch64, 4/10)         | `Run actions/checkout@v7`                                                                               |          4 |
| test262 (macos-aarch64, 4/10)         | `Run jdx/mise-action@v4`                                                                                |         32 |
| test262 (macos-aarch64, 4/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          4 |
| test262 (macos-aarch64, 4/10)         | `Run mise run test:test262 --shard 4/10`                                                                |       1756 |
| test262 (macos-aarch64, 4/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test262 (macos-aarch64, 4/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 4/10)         | `Complete job`                                                                                          |          1 |
| test262 (macos-aarch64, 5/10)         | Whole job (108457960913)                                                                                |       1644 |
| test262 (macos-aarch64, 5/10)         | `Set up job`                                                                                            |          1 |
| test262 (macos-aarch64, 5/10)         | `Run actions/checkout@v7`                                                                               |          4 |
| test262 (macos-aarch64, 5/10)         | `Run jdx/mise-action@v4`                                                                                |         27 |
| test262 (macos-aarch64, 5/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          3 |
| test262 (macos-aarch64, 5/10)         | `Run mise run test:test262 --shard 5/10`                                                                |       1605 |
| test262 (macos-aarch64, 5/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| test262 (macos-aarch64, 5/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 5/10)         | `Complete job`                                                                                          |          0 |
| test262 (macos-aarch64, 6/10)         | Whole job (108457960977)                                                                                |       1630 |
| test262 (macos-aarch64, 6/10)         | `Set up job`                                                                                            |          2 |
| test262 (macos-aarch64, 6/10)         | `Run actions/checkout@v7`                                                                               |          3 |
| test262 (macos-aarch64, 6/10)         | `Run jdx/mise-action@v4`                                                                                |         38 |
| test262 (macos-aarch64, 6/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          7 |
| test262 (macos-aarch64, 6/10)         | `Run mise run test:test262 --shard 6/10`                                                                |       1575 |
| test262 (macos-aarch64, 6/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| test262 (macos-aarch64, 6/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 6/10)         | `Complete job`                                                                                          |          2 |
| test262 (macos-aarch64, 7/10)         | Whole job (108457960899)                                                                                |       1808 |
| test262 (macos-aarch64, 7/10)         | `Set up job`                                                                                            |          1 |
| test262 (macos-aarch64, 7/10)         | `Run actions/checkout@v7`                                                                               |          5 |
| test262 (macos-aarch64, 7/10)         | `Run jdx/mise-action@v4`                                                                                |         34 |
| test262 (macos-aarch64, 7/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          4 |
| test262 (macos-aarch64, 7/10)         | `Run mise run test:test262 --shard 7/10`                                                                |       1758 |
| test262 (macos-aarch64, 7/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test262 (macos-aarch64, 7/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 7/10)         | `Complete job`                                                                                          |          2 |
| test262 (macos-aarch64, 8/10)         | Whole job (108457960821)                                                                                |       2257 |
| test262 (macos-aarch64, 8/10)         | `Set up job`                                                                                            |          2 |
| test262 (macos-aarch64, 8/10)         | `Run actions/checkout@v7`                                                                               |          5 |
| test262 (macos-aarch64, 8/10)         | `Run jdx/mise-action@v4`                                                                                |         42 |
| test262 (macos-aarch64, 8/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| test262 (macos-aarch64, 8/10)         | `Run mise run test:test262 --shard 8/10`                                                                |       2196 |
| test262 (macos-aarch64, 8/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test262 (macos-aarch64, 8/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 8/10)         | `Complete job`                                                                                          |          1 |
| test262 (macos-aarch64, 9/10)         | Whole job (108457960879)                                                                                |       1926 |
| test262 (macos-aarch64, 9/10)         | `Set up job`                                                                                            |          1 |
| test262 (macos-aarch64, 9/10)         | `Run actions/checkout@v7`                                                                               |          3 |
| test262 (macos-aarch64, 9/10)         | `Run jdx/mise-action@v4`                                                                                |         35 |
| test262 (macos-aarch64, 9/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          4 |
| test262 (macos-aarch64, 9/10)         | `Run mise run test:test262 --shard 9/10`                                                                |       1878 |
| test262 (macos-aarch64, 9/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test262 (macos-aarch64, 9/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 9/10)         | `Complete job`                                                                                          |          2 |


Run 36312192623 at `af9bb68c`
-----------------------------

| Source job                            | Step                                                                                                    | Measured s |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------: |
| host C sanitizers (macOS, native)     | Whole job (108600171306)                                                                                |       2424 |
| host C sanitizers (macOS, native)     | `Set up job`                                                                                            |          2 |
| host C sanitizers (macOS, native)     | `Run actions/checkout@v7`                                                                               |          3 |
| host C sanitizers (macOS, native)     | `Run jdx/mise-action@v4`                                                                                |         68 |
| host C sanitizers (macOS, native)     | `Run ./.github/actions/runtime-archive-cache`                                                           |         12 |
| host C sanitizers (macOS, native)     | `Run mise run test:sanitizer:self`                                                                      |         10 |
| host C sanitizers (macOS, native)     | `Run mise run test:sanitizer:runtime`                                                                   |        324 |
| host C sanitizers (macOS, native)     | `Run mise run test:sanitizer:native`                                                                    |       1997 |
| host C sanitizers (macOS, native)     | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          2 |
| host C sanitizers (macOS, native)     | `Post Run actions/checkout@v7`                                                                          |          1 |
| host C sanitizers (macOS, native)     | `Complete job`                                                                                          |          2 |
| host C sanitizers (macOS, property)   | Whole job (108600171396)                                                                                |       1961 |
| host C sanitizers (macOS, property)   | `Set up job`                                                                                            |          1 |
| host C sanitizers (macOS, property)   | `Run actions/checkout@v7`                                                                               |          3 |
| host C sanitizers (macOS, property)   | `Run jdx/mise-action@v4`                                                                                |         35 |
| host C sanitizers (macOS, property)   | `Run ./.github/actions/runtime-archive-cache`                                                           |          8 |
| host C sanitizers (macOS, property)   | `Run mise run test:sanitizer:self`                                                                      |          4 |
| host C sanitizers (macOS, property)   | `Run mise run test:sanitizer:property`                                                                  |       1906 |
| host C sanitizers (macOS, property)   | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| host C sanitizers (macOS, property)   | `Post Run actions/checkout@v7`                                                                          |          1 |
| host C sanitizers (macOS, property)   | `Complete job`                                                                                          |          2 |
| native (macos-aarch64, 1/3)           | Whole job (108600171355)                                                                                |        911 |
| native (macos-aarch64, 1/3)           | `Set up job`                                                                                            |          2 |
| native (macos-aarch64, 1/3)           | `Run actions/checkout@v7`                                                                               |          4 |
| native (macos-aarch64, 1/3)           | `Run jdx/mise-action@v4`                                                                                |         39 |
| native (macos-aarch64, 1/3)           | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| native (macos-aarch64, 1/3)           | `Run mise run test:native --shard 1/3`                                                                  |        854 |
| native (macos-aarch64, 1/3)           | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native (macos-aarch64, 1/3)           | `Post Run actions/checkout@v7`                                                                          |          1 |
| native (macos-aarch64, 1/3)           | `Complete job`                                                                                          |          1 |
| native (macos-aarch64, 2/3)           | Whole job (108600171338)                                                                                |        846 |
| native (macos-aarch64, 2/3)           | `Set up job`                                                                                            |          1 |
| native (macos-aarch64, 2/3)           | `Run actions/checkout@v7`                                                                               |          4 |
| native (macos-aarch64, 2/3)           | `Run jdx/mise-action@v4`                                                                                |         47 |
| native (macos-aarch64, 2/3)           | `Run ./.github/actions/runtime-archive-cache`                                                           |          3 |
| native (macos-aarch64, 2/3)           | `Run mise run test:native --shard 2/3`                                                                  |        786 |
| native (macos-aarch64, 2/3)           | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native (macos-aarch64, 2/3)           | `Post Run actions/checkout@v7`                                                                          |          0 |
| native (macos-aarch64, 2/3)           | `Complete job`                                                                                          |          1 |
| native (macos-aarch64, 3/3)           | Whole job (108600171412)                                                                                |       1191 |
| native (macos-aarch64, 3/3)           | `Set up job`                                                                                            |          2 |
| native (macos-aarch64, 3/3)           | `Run actions/checkout@v7`                                                                               |          5 |
| native (macos-aarch64, 3/3)           | `Run jdx/mise-action@v4`                                                                                |         40 |
| native (macos-aarch64, 3/3)           | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| native (macos-aarch64, 3/3)           | `Run mise run test:native --shard 3/3`                                                                  |       1133 |
| native (macos-aarch64, 3/3)           | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native (macos-aarch64, 3/3)           | `Post Run actions/checkout@v7`                                                                          |          1 |
| native (macos-aarch64, 3/3)           | `Complete job`                                                                                          |          1 |
| native support (macos-aarch64, 1/12)  | Whole job (108600171591)                                                                                |       1176 |
| native support (macos-aarch64, 1/12)  | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 1/12)  | `Run actions/checkout@v7`                                                                               |          2 |
| native support (macos-aarch64, 1/12)  | `Run jdx/mise-action@v4`                                                                                |         32 |
| native support (macos-aarch64, 1/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          4 |
| native support (macos-aarch64, 1/12)  | `Run mise run test:property:extended:package`                                                           |         10 |
| native support (macos-aarch64, 1/12)  | `Run mise run test:property:extended:native:shard --test-shard=1/12 tests/property/*.property.test.ts`  |       1121 |
| native support (macos-aarch64, 1/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native support (macos-aarch64, 1/12)  | `Post Run actions/checkout@v7`                                                                          |          2 |
| native support (macos-aarch64, 1/12)  | `Complete job`                                                                                          |          0 |
| native support (macos-aarch64, 10/12) | Whole job (108600171619)                                                                                |       1461 |
| native support (macos-aarch64, 10/12) | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 10/12) | `Run actions/checkout@v7`                                                                               |          3 |
| native support (macos-aarch64, 10/12) | `Run jdx/mise-action@v4`                                                                                |         43 |
| native support (macos-aarch64, 10/12) | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| native support (macos-aarch64, 10/12) | `Run mise run test:property:extended:native:shard --test-shard=10/12 tests/property/*.property.test.ts` |       1402 |
| native support (macos-aarch64, 10/12) | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native support (macos-aarch64, 10/12) | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 10/12) | `Complete job`                                                                                          |          1 |
| native support (macos-aarch64, 11/12) | Whole job (108600171562)                                                                                |       1065 |
| native support (macos-aarch64, 11/12) | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 11/12) | `Run actions/checkout@v7`                                                                               |          3 |
| native support (macos-aarch64, 11/12) | `Run jdx/mise-action@v4`                                                                                |         42 |
| native support (macos-aarch64, 11/12) | `Run ./.github/actions/runtime-archive-cache`                                                           |          7 |
| native support (macos-aarch64, 11/12) | `Run mise run test:property:extended:native:shard --test-shard=11/12 tests/property/*.property.test.ts` |       1005 |
| native support (macos-aarch64, 11/12) | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native support (macos-aarch64, 11/12) | `Post Run actions/checkout@v7`                                                                          |          0 |
| native support (macos-aarch64, 11/12) | `Complete job`                                                                                          |          2 |
| native support (macos-aarch64, 12/12) | Whole job (108600171632)                                                                                |       1746 |
| native support (macos-aarch64, 12/12) | `Set up job`                                                                                            |          1 |
| native support (macos-aarch64, 12/12) | `Run actions/checkout@v7`                                                                               |          6 |
| native support (macos-aarch64, 12/12) | `Run jdx/mise-action@v4`                                                                                |         47 |
| native support (macos-aarch64, 12/12) | `Run ./.github/actions/runtime-archive-cache`                                                           |          9 |
| native support (macos-aarch64, 12/12) | `Run mise run test:property:extended:native:shard --test-shard=12/12 tests/property/*.property.test.ts` |       1673 |
| native support (macos-aarch64, 12/12) | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native support (macos-aarch64, 12/12) | `Post Run actions/checkout@v7`                                                                          |          2 |
| native support (macos-aarch64, 12/12) | `Complete job`                                                                                          |          3 |
| native support (macos-aarch64, 2/12)  | Whole job (108600171496)                                                                                |       1380 |
| native support (macos-aarch64, 2/12)  | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 2/12)  | `Run actions/checkout@v7`                                                                               |          4 |
| native support (macos-aarch64, 2/12)  | `Run jdx/mise-action@v4`                                                                                |         37 |
| native support (macos-aarch64, 2/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| native support (macos-aarch64, 2/12)  | `Run mise run test:property:extended:native:shard --test-shard=2/12 tests/property/*.property.test.ts`  |       1326 |
| native support (macos-aarch64, 2/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native support (macos-aarch64, 2/12)  | `Post Run actions/checkout@v7`                                                                          |          0 |
| native support (macos-aarch64, 2/12)  | `Complete job`                                                                                          |          1 |
| native support (macos-aarch64, 3/12)  | Whole job (108600171561)                                                                                |       2016 |
| native support (macos-aarch64, 3/12)  | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 3/12)  | `Run actions/checkout@v7`                                                                               |          3 |
| native support (macos-aarch64, 3/12)  | `Run jdx/mise-action@v4`                                                                                |         29 |
| native support (macos-aarch64, 3/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          3 |
| native support (macos-aarch64, 3/12)  | `Run mise run test:property:extended:native:shard --test-shard=3/12 tests/property/*.property.test.ts`  |       1968 |
| native support (macos-aarch64, 3/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native support (macos-aarch64, 3/12)  | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 3/12)  | `Complete job`                                                                                          |          8 |
| native support (macos-aarch64, 4/12)  | Whole job (108600171516)                                                                                |       1866 |
| native support (macos-aarch64, 4/12)  | `Set up job`                                                                                            |          1 |
| native support (macos-aarch64, 4/12)  | `Run actions/checkout@v7`                                                                               |          4 |
| native support (macos-aarch64, 4/12)  | `Run jdx/mise-action@v4`                                                                                |         37 |
| native support (macos-aarch64, 4/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| native support (macos-aarch64, 4/12)  | `Run mise run test:property:extended:native:shard --test-shard=4/12 tests/property/*.property.test.ts`  |       1811 |
| native support (macos-aarch64, 4/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native support (macos-aarch64, 4/12)  | `Post Run actions/checkout@v7`                                                                          |          0 |
| native support (macos-aarch64, 4/12)  | `Complete job`                                                                                          |          3 |
| native support (macos-aarch64, 5/12)  | Whole job (108600171581)                                                                                |       3086 |
| native support (macos-aarch64, 5/12)  | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 5/12)  | `Run actions/checkout@v7`                                                                               |          3 |
| native support (macos-aarch64, 5/12)  | `Run jdx/mise-action@v4`                                                                                |         23 |
| native support (macos-aarch64, 5/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          3 |
| native support (macos-aarch64, 5/12)  | `Run mise run test:property:extended:native:shard --test-shard=5/12 tests/property/*.property.test.ts`  |       3051 |
| native support (macos-aarch64, 5/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native support (macos-aarch64, 5/12)  | `Post Run actions/checkout@v7`                                                                          |          0 |
| native support (macos-aarch64, 5/12)  | `Complete job`                                                                                          |          0 |
| native support (macos-aarch64, 6/12)  | Whole job (108600171866)                                                                                |       1371 |
| native support (macos-aarch64, 6/12)  | `Set up job`                                                                                            |          1 |
| native support (macos-aarch64, 6/12)  | `Run actions/checkout@v7`                                                                               |          4 |
| native support (macos-aarch64, 6/12)  | `Run jdx/mise-action@v4`                                                                                |         38 |
| native support (macos-aarch64, 6/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| native support (macos-aarch64, 6/12)  | `Run mise run test:property:extended:native:shard --test-shard=6/12 tests/property/*.property.test.ts`  |       1318 |
| native support (macos-aarch64, 6/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native support (macos-aarch64, 6/12)  | `Post Run actions/checkout@v7`                                                                          |          0 |
| native support (macos-aarch64, 6/12)  | `Complete job`                                                                                          |          1 |
| native support (macos-aarch64, 7/12)  | Whole job (108600171617)                                                                                |       1226 |
| native support (macos-aarch64, 7/12)  | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 7/12)  | `Run actions/checkout@v7`                                                                               |          3 |
| native support (macos-aarch64, 7/12)  | `Run jdx/mise-action@v4`                                                                                |         28 |
| native support (macos-aarch64, 7/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          5 |
| native support (macos-aarch64, 7/12)  | `Run mise run test:property:extended:native:shard --test-shard=7/12 tests/property/*.property.test.ts`  |       1185 |
| native support (macos-aarch64, 7/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| native support (macos-aarch64, 7/12)  | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 7/12)  | `Complete job`                                                                                          |          1 |
| native support (macos-aarch64, 8/12)  | Whole job (108600171537)                                                                                |       1246 |
| native support (macos-aarch64, 8/12)  | `Set up job`                                                                                            |          1 |
| native support (macos-aarch64, 8/12)  | `Run actions/checkout@v7`                                                                               |          4 |
| native support (macos-aarch64, 8/12)  | `Run jdx/mise-action@v4`                                                                                |         37 |
| native support (macos-aarch64, 8/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          7 |
| native support (macos-aarch64, 8/12)  | `Run mise run test:property:extended:native:shard --test-shard=8/12 tests/property/*.property.test.ts`  |       1191 |
| native support (macos-aarch64, 8/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native support (macos-aarch64, 8/12)  | `Post Run actions/checkout@v7`                                                                          |          1 |
| native support (macos-aarch64, 8/12)  | `Complete job`                                                                                          |          1 |
| native support (macos-aarch64, 9/12)  | Whole job (108600171579)                                                                                |        777 |
| native support (macos-aarch64, 9/12)  | `Set up job`                                                                                            |          2 |
| native support (macos-aarch64, 9/12)  | `Run actions/checkout@v7`                                                                               |          4 |
| native support (macos-aarch64, 9/12)  | `Run jdx/mise-action@v4`                                                                                |         29 |
| native support (macos-aarch64, 9/12)  | `Run ./.github/actions/runtime-archive-cache`                                                           |          4 |
| native support (macos-aarch64, 9/12)  | `Run mise run test:property:extended:native:shard --test-shard=9/12 tests/property/*.property.test.ts`  |        734 |
| native support (macos-aarch64, 9/12)  | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| native support (macos-aarch64, 9/12)  | `Post Run actions/checkout@v7`                                                                          |          0 |
| native support (macos-aarch64, 9/12)  | `Complete job`                                                                                          |          2 |
| test (macos-latest, deno)             | Whole job (108600171356)                                                                                |        151 |
| test (macos-latest, deno)             | `Set up job`                                                                                            |          1 |
| test (macos-latest, deno)             | `Run actions/checkout@v7`                                                                               |          3 |
| test (macos-latest, deno)             | `Run jdx/mise-action@v4`                                                                                |         70 |
| test (macos-latest, deno)             | `Run ./.github/actions/runtime-archive-cache`                                                           |          8 |
| test (macos-latest, deno)             | `Run mise run test:deno`                                                                                |         62 |
| test (macos-latest, deno)             | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test (macos-latest, deno)             | `Post Run actions/checkout@v7`                                                                          |          1 |
| test (macos-latest, deno)             | `Complete job`                                                                                          |          1 |
| test (macos-latest, node)             | Whole job (108600171522)                                                                                |       2986 |
| test (macos-latest, node)             | `Set up job`                                                                                            |          2 |
| test (macos-latest, node)             | `Run actions/checkout@v7`                                                                               |          3 |
| test (macos-latest, node)             | `Run jdx/mise-action@v4`                                                                                |         31 |
| test (macos-latest, node)             | `Run ./.github/actions/runtime-archive-cache`                                                           |          3 |
| test (macos-latest, node)             | `Run mise run test:node`                                                                                |       2943 |
| test (macos-latest, node)             | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test (macos-latest, node)             | `Post Run actions/checkout@v7`                                                                          |          1 |
| test (macos-latest, node)             | `Complete job`                                                                                          |          2 |
| test262 (macos-aarch64, 1/10)         | Whole job (108600171460)                                                                                |       1667 |
| test262 (macos-aarch64, 1/10)         | `Set up job`                                                                                            |          2 |
| test262 (macos-aarch64, 1/10)         | `Run actions/checkout@v7`                                                                               |          3 |
| test262 (macos-aarch64, 1/10)         | `Run jdx/mise-action@v4`                                                                                |         36 |
| test262 (macos-aarch64, 1/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          5 |
| test262 (macos-aarch64, 1/10)         | `Run mise run test:test262 --shard 1/10`                                                                |       1615 |
| test262 (macos-aarch64, 1/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| test262 (macos-aarch64, 1/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 1/10)         | `Complete job`                                                                                          |          2 |
| test262 (macos-aarch64, 10/10)        | Whole job (108600171425)                                                                                |       1656 |
| test262 (macos-aarch64, 10/10)        | `Set up job`                                                                                            |          1 |
| test262 (macos-aarch64, 10/10)        | `Run actions/checkout@v7`                                                                               |          4 |
| test262 (macos-aarch64, 10/10)        | `Run jdx/mise-action@v4`                                                                                |         32 |
| test262 (macos-aarch64, 10/10)        | `Run ./.github/actions/runtime-archive-cache`                                                           |          5 |
| test262 (macos-aarch64, 10/10)        | `Run mise run test:test262 --shard 10/10`                                                               |       1608 |
| test262 (macos-aarch64, 10/10)        | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| test262 (macos-aarch64, 10/10)        | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 10/10)        | `Complete job`                                                                                          |          3 |
| test262 (macos-aarch64, 2/10)         | Whole job (108600171451)                                                                                |       1563 |
| test262 (macos-aarch64, 2/10)         | `Set up job`                                                                                            |          2 |
| test262 (macos-aarch64, 2/10)         | `Run actions/checkout@v7`                                                                               |          4 |
| test262 (macos-aarch64, 2/10)         | `Run jdx/mise-action@v4`                                                                                |         36 |
| test262 (macos-aarch64, 2/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| test262 (macos-aarch64, 2/10)         | `Run mise run test:test262 --shard 2/10`                                                                |       1509 |
| test262 (macos-aarch64, 2/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| test262 (macos-aarch64, 2/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 2/10)         | `Complete job`                                                                                          |          2 |
| test262 (macos-aarch64, 3/10)         | Whole job (108600171403)                                                                                |       2063 |
| test262 (macos-aarch64, 3/10)         | `Set up job`                                                                                            |          2 |
| test262 (macos-aarch64, 3/10)         | `Run actions/checkout@v7`                                                                               |          4 |
| test262 (macos-aarch64, 3/10)         | `Run jdx/mise-action@v4`                                                                                |         37 |
| test262 (macos-aarch64, 3/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          5 |
| test262 (macos-aarch64, 3/10)         | `Run mise run test:test262 --shard 3/10`                                                                |       2011 |
| test262 (macos-aarch64, 3/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| test262 (macos-aarch64, 3/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 3/10)         | `Complete job`                                                                                          |          1 |
| test262 (macos-aarch64, 4/10)         | Whole job (108600171517)                                                                                |       1937 |
| test262 (macos-aarch64, 4/10)         | `Set up job`                                                                                            |          2 |
| test262 (macos-aarch64, 4/10)         | `Run actions/checkout@v7`                                                                               |          3 |
| test262 (macos-aarch64, 4/10)         | `Run jdx/mise-action@v4`                                                                                |         28 |
| test262 (macos-aarch64, 4/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          5 |
| test262 (macos-aarch64, 4/10)         | `Run mise run test:test262 --shard 4/10`                                                                |       1895 |
| test262 (macos-aarch64, 4/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test262 (macos-aarch64, 4/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 4/10)         | `Complete job`                                                                                          |          0 |
| test262 (macos-aarch64, 5/10)         | Whole job (108600171391)                                                                                |       1581 |
| test262 (macos-aarch64, 5/10)         | `Set up job`                                                                                            |          1 |
| test262 (macos-aarch64, 5/10)         | `Run actions/checkout@v7`                                                                               |          4 |
| test262 (macos-aarch64, 5/10)         | `Run jdx/mise-action@v4`                                                                                |         50 |
| test262 (macos-aarch64, 5/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          3 |
| test262 (macos-aarch64, 5/10)         | `Run mise run test:test262 --shard 5/10`                                                                |       1517 |
| test262 (macos-aarch64, 5/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| test262 (macos-aarch64, 5/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 5/10)         | `Complete job`                                                                                          |          3 |
| test262 (macos-aarch64, 6/10)         | Whole job (108600171389)                                                                                |       2070 |
| test262 (macos-aarch64, 6/10)         | `Set up job`                                                                                            |          2 |
| test262 (macos-aarch64, 6/10)         | `Run actions/checkout@v7`                                                                               |          3 |
| test262 (macos-aarch64, 6/10)         | `Run jdx/mise-action@v4`                                                                                |         58 |
| test262 (macos-aarch64, 6/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          5 |
| test262 (macos-aarch64, 6/10)         | `Run mise run test:test262 --shard 6/10`                                                                |       1996 |
| test262 (macos-aarch64, 6/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test262 (macos-aarch64, 6/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 6/10)         | `Complete job`                                                                                          |          0 |
| test262 (macos-aarch64, 7/10)         | Whole job (108600171410)                                                                                |       1841 |
| test262 (macos-aarch64, 7/10)         | `Set up job`                                                                                            |          1 |
| test262 (macos-aarch64, 7/10)         | `Run actions/checkout@v7`                                                                               |          4 |
| test262 (macos-aarch64, 7/10)         | `Run jdx/mise-action@v4`                                                                                |         40 |
| test262 (macos-aarch64, 7/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          5 |
| test262 (macos-aarch64, 7/10)         | `Run mise run test:test262 --shard 7/10`                                                                |       1785 |
| test262 (macos-aarch64, 7/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          0 |
| test262 (macos-aarch64, 7/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 7/10)         | `Complete job`                                                                                          |          1 |
| test262 (macos-aarch64, 8/10)         | Whole job (108600171420)                                                                                |       1799 |
| test262 (macos-aarch64, 8/10)         | `Set up job`                                                                                            |          2 |
| test262 (macos-aarch64, 8/10)         | `Run actions/checkout@v7`                                                                               |          4 |
| test262 (macos-aarch64, 8/10)         | `Run jdx/mise-action@v4`                                                                                |         42 |
| test262 (macos-aarch64, 8/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          6 |
| test262 (macos-aarch64, 8/10)         | `Run mise run test:test262 --shard 8/10`                                                                |       1739 |
| test262 (macos-aarch64, 8/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test262 (macos-aarch64, 8/10)         | `Post Run actions/checkout@v7`                                                                          |          0 |
| test262 (macos-aarch64, 8/10)         | `Complete job`                                                                                          |          1 |
| test262 (macos-aarch64, 9/10)         | Whole job (108600171379)                                                                                |       1624 |
| test262 (macos-aarch64, 9/10)         | `Set up job`                                                                                            |          2 |
| test262 (macos-aarch64, 9/10)         | `Run actions/checkout@v7`                                                                               |          4 |
| test262 (macos-aarch64, 9/10)         | `Run jdx/mise-action@v4`                                                                                |         26 |
| test262 (macos-aarch64, 9/10)         | `Run ./.github/actions/runtime-archive-cache`                                                           |          3 |
| test262 (macos-aarch64, 9/10)         | `Run mise run test:test262 --shard 9/10`                                                                |       1585 |
| test262 (macos-aarch64, 9/10)         | `Post Run ./.github/actions/runtime-archive-cache`                                                      |          1 |
| test262 (macos-aarch64, 9/10)         | `Post Run actions/checkout@v7`                                                                          |          1 |
| test262 (macos-aarch64, 9/10)         | `Complete job`                                                                                          |          1 |
