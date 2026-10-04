macOS static lane evidence (U16)
================================

The U16 generator expanded the existing macOS workload into five explicit job
chains. Original matrix values are bound directly into commands, conditions,
and artifact names. The macOS jobs have no matrices, so GitHub cannot append
matrix values to their required check names. Linux and Windows keep their
existing matrix jobs.

The current default generates five hosted lanes and one optional Mac lane.
When that lane falls back, its jobs have no predecessor chain and can use all
five hosted slots.
The 8872-second estimate below applies only to the historical five-lane
topology. The current workflow generates a sixth optional lane whose jobs
fall back to hosted runners while the switch is off. See
[*self-hosted-mac.md*](../../self-hosted-mac.md). The availability check adds
one name to this document's original 58-name baseline.

The source template is *tools/main-workflow.template.yaml*; regenerate with
`mise run generate:macos-lanes`. `mise run check:macos-lanes`, included in
`mise run check`, rejects workflow drift and checks the preserved contracts.

Unchanged job costs are measured wall seconds from main run `36516215200`
(`97278fc6`), including setup and execution. The twelve native-support
weights are derived estimates for their changed file sets: each applies the
ratio of new to old modeled worker makespan to the observed variable time,
with 71 seconds of observed shard-1 fixed cost retained as a proxy. Three
new own-key case jobs use derived 1,300-second weights. These estimates
were compared with one branch CI observation in run `37121778924`:
the native-support weight total was a derived 427 seconds below the
observed job-wall total, while all three own-key weights exceeded their
observed job walls of 806 to 1,085 seconds. The measurements are in
[*PLAN-GATE.md*](../../../PLAN-GATE.md). The weights remain planning
estimates because one run does not separate runner variance from
repeatable cost. The model assumes five exclusive slots and excludes
queue delays; its derived longest lane is 9,414 seconds (156.9 minutes).
The measured baseline's longest lane was 8,872 seconds (147.9 minutes).
A changed lane estimate is not a measured improvement.


Lane plan
---------

All start, finish, and lane totals below are derived seconds from the
mixed measured and estimated costs above, relative to an ideal simultaneous
lane start. This table is the historical `macosLanes(0)` assignment, not
the current one-lane-enabled workflow. The current optional lane contains
all three own-key case shards; the generated *main.yaml* records every job
assignment and dependency.

| Lane | Job                                     | Start (derived s) | Finish (derived s) |
| ---- | --------------------------------------- | ----------------- | ------------------ |
| 1    | `test (macos-latest, node)`             | 0                 | 2875               |
| 1    | `native support (macos-aarch64, 8/12)`  | 2875              | 4208               |
| 1    | `own-key cases (macos-aarch64, 2/3)`    | 4208              | 5508               |
| 1    | `test262 (macos-aarch64, 7/12)`         | 5508              | 6745               |
| 1    | `test262 (macos-aarch64, 10/12)`        | 6745              | 7899               |
| 1    | `test262 (macos-aarch64, 1/12)`         | 7899              | 8973               |
| 2    | `host C sanitizers (macOS, native)`     | 0                 | 2197               |
| 2    | `native support (macos-aarch64, 2/12)`  | 2197              | 3548               |
| 2    | `native support (macos-aarch64, 11/12)` | 3548              | 4855               |
| 2    | `test262 (macos-aarch64, 12/12)`        | 4855              | 6117               |
| 2    | `native support (macos-aarch64, 12/12)` | 6117              | 7292               |
| 2    | `test262 (macos-aarch64, 6/12)`         | 7292              | 8375               |
| 2    | `native (macos-aarch64, 3/3)`           | 8375              | 9414               |
| 3    | `test262 (macos-aarch64, 8/12)`         | 0                 | 2007               |
| 3    | `native support (macos-aarch64, 4/12)`  | 2007              | 3417               |
| 3    | `native support (macos-aarch64, 7/12)`  | 3417              | 4742               |
| 3    | `own-key cases (macos-aarch64, 3/3)`    | 4742              | 6042               |
| 3    | `native support (macos-aarch64, 3/12)`  | 6042              | 7278               |
| 3    | `test262 (macos-aarch64, 4/12)`         | 7278              | 8415               |
| 3    | `test (macos-latest, deno)`             | 8415              | 8528               |
| 4    | `native support (macos-aarch64, 1/12)`  | 0                 | 1958               |
| 4    | `native support (macos-aarch64, 9/12)`  | 1958              | 3462               |
| 4    | `test262 (macos-aarch64, 2/12)`         | 3462              | 4779               |
| 4    | `test262 (macos-aarch64, 9/12)`         | 4779              | 6054               |
| 4    | `native support (macos-aarch64, 6/12)`  | 6054              | 7290               |
| 4    | `native support (macos-aarch64, 10/12)` | 7290              | 8381               |
| 4    | `native (macos-aarch64, 2/3)`           | 8381              | 9296               |
| 5    | `host C sanitizers (macOS, property)`   | 0                 | 1923               |
| 5    | `test262 (macos-aarch64, 5/12)`         | 1923              | 3559               |
| 5    | `own-key cases (macos-aarch64, 1/3)`    | 3559              | 4859               |
| 5    | `native support (macos-aarch64, 5/12)`  | 4859              | 6096               |
| 5    | `test262 (macos-aarch64, 11/12)`        | 6096              | 7280               |
| 5    | `test262 (macos-aarch64, 3/12)`         | 7280              | 8402               |
| 5    | `native (macos-aarch64, 1/3)`           | 8402              | 9252               |


Scheduling and cancellation
---------------------------

In the historical five-lane plan, only the first job of each lane is initially
eligible. Later jobs depend on
the previous job and use `!cancelled()`, so predecessor failure does not skip
coverage. Cancellation stops the remaining lane. The `native` aggregate
uses `always()` and requires success from every Linux matrix and every
explicit macOS native, native support, own-key case, and test262 job;
skipped and cancelled results fail. The aggregate downloads all six case
duration artifacts and runs `mise run check:property-case-durations`;
missing records or a host sum above the original limit fail. Tests execute
that predicate for all four result states.
The aggregate now also performs checkout, pinned tool installation, and
workspace dependency setup before checking the downloaded records. Its
previous whole-job time was an observed three seconds in main run
`36516215200`; the changed fixed cost is not yet measured and is outside
the derived macOS lane totals above.

GitHub still controls runner allocation. Lanes constrain eligibility, not
runner start times or global priority. The workflow concurrency policy is
unchanged: main pushes use separate SHA groups and do not cancel each other;
other refs share a group per ref and cancel superseded runs. Other main
pushes, refs, or repository workflows can compete for the five macOS slots.
The two `macos-latest` tests retain that exact runner label; the other macOS
jobs retain `macos-15`.


Live name correction
--------------------

Branch run [36598029271] started at revision `d0a39f79`, which used one-entry
macOS matrices and literal job names. Its measured GitHub job names included
`test (macos-latest, node) (macos-latest, node)`. This falsified the original
local name-expansion model: GitHub appends matrix values to a literal name,
even when the matrix has only one entry. The lane topology and workloads in
that revision remain a timing sample; it does not prove name preservation.

The same run's unchanged [Linux sanitizer job] failed in
`test:sanitizer:native` before compiling the `monotonic-timer-wakeups` fixture.
Node printed `nested zero delay` before the equal-time callbacks; Deno
printed it afterward. Both reference processes exited with status zero, but
their differential comparison failed, so the following property step was
skipped. The fixture assumes timers spaced by at least 30 ms cannot reorder
under host stalls; that assumption did not hold in this sanitizer run. The
name fix does not remove the risk of another reference divergence. This run
cannot supply a push-to-green time. Its macOS lane timings remain a
failed-run observation.

The corrected generator binds the original matrix values directly and emits
no macOS matrices. It selects the same active conditional steps. The
corrected workflow passed branch run [36640728403] at `82bba77e`.
Its 58 displayed check names match the main-run inventory. Both samples
are recorded by revision in
[*docs/gate-cost-baseline.md*](../../gate-cost-baseline.md), with runner
variance and queue delays left unseparated.

*baseline-check-names.json* records all 58 measured job names from main run
[36516215200]. It was obtained with:

~~~~ sh
gh api repos/dahlia/oseo/actions/runs/36516215200/jobs \
  --paginate --slurp
~~~~

The fixture contains the sorted `name` fields from every page's `jobs` array,
plus the source run and URL. The generator tests compare the 58 existing
rendered names against this observed list and require every macOS job to
have no matrix. U19 adds six own-key case job names, three for each host.

[Linux sanitizer job]: https://github.com/dahlia/oseo/actions/runs/36598029271/job/109507894548
[36516215200]: https://github.com/dahlia/oseo/actions/runs/36516215200
[36598029271]: https://github.com/dahlia/oseo/actions/runs/36598029271
[36640728403]: https://github.com/dahlia/oseo/actions/runs/36640728403


Check name inventory
--------------------

The before column expands the source workflow matrices and matches the
observed baseline fixture; the after column shows how each of those 58
existing names appears in the current generated workflow. No macOS job has
a matrix. All 58 existing names match, including
the aggregate and Linux/Windows checks. The focused generator test repeats
this comparison; explicit job IDs change only for macOS lane dependencies.
The six new names are `own-key cases (linux-x86_64-gnu, 1/3)` through
`own-key cases (linux-x86_64-gnu, 3/3)` and
`own-key cases (macos-aarch64, 1/3)` through
`own-key cases (macos-aarch64, 3/3)`.

| Before                                   | After                                    |
| ---------------------------------------- | ---------------------------------------- |
| `check`                                  | `check`                                  |
| `host C sanitizers (Linux)`              | `host C sanitizers (Linux)`              |
| `host C sanitizers (macOS, native)`      | `host C sanitizers (macOS, native)`      |
| `host C sanitizers (macOS, property)`    | `host C sanitizers (macOS, property)`    |
| `native`                                 | `native`                                 |
| `native (linux-x86_64-gnu, 1/3)`         | `native (linux-x86_64-gnu, 1/3)`         |
| `native (linux-x86_64-gnu, 2/3)`         | `native (linux-x86_64-gnu, 2/3)`         |
| `native (linux-x86_64-gnu, 3/3)`         | `native (linux-x86_64-gnu, 3/3)`         |
| `native (macos-aarch64, 1/3)`            | `native (macos-aarch64, 1/3)`            |
| `native (macos-aarch64, 2/3)`            | `native (macos-aarch64, 2/3)`            |
| `native (macos-aarch64, 3/3)`            | `native (macos-aarch64, 3/3)`            |
| `native support (linux-x86_64-gnu, 1/5)` | `native support (linux-x86_64-gnu, 1/5)` |
| `native support (linux-x86_64-gnu, 2/5)` | `native support (linux-x86_64-gnu, 2/5)` |
| `native support (linux-x86_64-gnu, 3/5)` | `native support (linux-x86_64-gnu, 3/5)` |
| `native support (linux-x86_64-gnu, 4/5)` | `native support (linux-x86_64-gnu, 4/5)` |
| `native support (linux-x86_64-gnu, 5/5)` | `native support (linux-x86_64-gnu, 5/5)` |
| `native support (macos-aarch64, 1/12)`   | `native support (macos-aarch64, 1/12)`   |
| `native support (macos-aarch64, 10/12)`  | `native support (macos-aarch64, 10/12)`  |
| `native support (macos-aarch64, 11/12)`  | `native support (macos-aarch64, 11/12)`  |
| `native support (macos-aarch64, 12/12)`  | `native support (macos-aarch64, 12/12)`  |
| `native support (macos-aarch64, 2/12)`   | `native support (macos-aarch64, 2/12)`   |
| `native support (macos-aarch64, 3/12)`   | `native support (macos-aarch64, 3/12)`   |
| `native support (macos-aarch64, 4/12)`   | `native support (macos-aarch64, 4/12)`   |
| `native support (macos-aarch64, 5/12)`   | `native support (macos-aarch64, 5/12)`   |
| `native support (macos-aarch64, 6/12)`   | `native support (macos-aarch64, 6/12)`   |
| `native support (macos-aarch64, 7/12)`   | `native support (macos-aarch64, 7/12)`   |
| `native support (macos-aarch64, 8/12)`   | `native support (macos-aarch64, 8/12)`   |
| `native support (macos-aarch64, 9/12)`   | `native support (macos-aarch64, 9/12)`   |
| `test (macos-latest, deno)`              | `test (macos-latest, deno)`              |
| `test (macos-latest, node)`              | `test (macos-latest, node)`              |
| `test (ubuntu-latest, deno)`             | `test (ubuntu-latest, deno)`             |
| `test (ubuntu-latest, node)`             | `test (ubuntu-latest, node)`             |
| `test (windows-latest, deno)`            | `test (windows-latest, deno)`            |
| `test (windows-latest, node)`            | `test (windows-latest, node)`            |
| `test262 (linux-x86_64-gnu, 1/12)`       | `test262 (linux-x86_64-gnu, 1/12)`       |
| `test262 (linux-x86_64-gnu, 10/12)`      | `test262 (linux-x86_64-gnu, 10/12)`      |
| `test262 (linux-x86_64-gnu, 11/12)`      | `test262 (linux-x86_64-gnu, 11/12)`      |
| `test262 (linux-x86_64-gnu, 12/12)`      | `test262 (linux-x86_64-gnu, 12/12)`      |
| `test262 (linux-x86_64-gnu, 2/12)`       | `test262 (linux-x86_64-gnu, 2/12)`       |
| `test262 (linux-x86_64-gnu, 3/12)`       | `test262 (linux-x86_64-gnu, 3/12)`       |
| `test262 (linux-x86_64-gnu, 4/12)`       | `test262 (linux-x86_64-gnu, 4/12)`       |
| `test262 (linux-x86_64-gnu, 5/12)`       | `test262 (linux-x86_64-gnu, 5/12)`       |
| `test262 (linux-x86_64-gnu, 6/12)`       | `test262 (linux-x86_64-gnu, 6/12)`       |
| `test262 (linux-x86_64-gnu, 7/12)`       | `test262 (linux-x86_64-gnu, 7/12)`       |
| `test262 (linux-x86_64-gnu, 8/12)`       | `test262 (linux-x86_64-gnu, 8/12)`       |
| `test262 (linux-x86_64-gnu, 9/12)`       | `test262 (linux-x86_64-gnu, 9/12)`       |
| `test262 (macos-aarch64, 1/12)`          | `test262 (macos-aarch64, 1/12)`          |
| `test262 (macos-aarch64, 10/12)`         | `test262 (macos-aarch64, 10/12)`         |
| `test262 (macos-aarch64, 11/12)`         | `test262 (macos-aarch64, 11/12)`         |
| `test262 (macos-aarch64, 12/12)`         | `test262 (macos-aarch64, 12/12)`         |
| `test262 (macos-aarch64, 2/12)`          | `test262 (macos-aarch64, 2/12)`          |
| `test262 (macos-aarch64, 3/12)`          | `test262 (macos-aarch64, 3/12)`          |
| `test262 (macos-aarch64, 4/12)`          | `test262 (macos-aarch64, 4/12)`          |
| `test262 (macos-aarch64, 5/12)`          | `test262 (macos-aarch64, 5/12)`          |
| `test262 (macos-aarch64, 6/12)`          | `test262 (macos-aarch64, 6/12)`          |
| `test262 (macos-aarch64, 7/12)`          | `test262 (macos-aarch64, 7/12)`          |
| `test262 (macos-aarch64, 8/12)`          | `test262 (macos-aarch64, 8/12)`          |
| `test262 (macos-aarch64, 9/12)`          | `test262 (macos-aarch64, 9/12)`          |
