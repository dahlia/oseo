macOS static lane evidence (U16)
================================

The generator expands the existing macOS workload into five explicit job
chains. Original matrix values are bound directly into commands, conditions,
and artifact names. The macOS jobs have no matrices, so GitHub cannot append
matrix values to their required check names. Linux and Windows keep their
existing matrix jobs.

The source template is *tools/main-workflow.template.yaml*; regenerate with
`mise run generate:macos-lanes`. `mise run check:macos-lanes`, included in
`mise run check`, rejects workflow drift and checks the preserved contracts.

Costs are measured job wall seconds from main run `36516215200`
(`97278fc6`), copied from the reviewed research schedule model. They include
setup and execution; fixed and per-path costs are not separated in these
weights. The model is derived, assumes five exclusive slots, and excludes
additional queue delays. It reproduces a 147.9-minute longest lane.


Lane plan
---------

All start, finish, and lane totals below are derived seconds from those
measured costs, relative to an ideal simultaneous lane start.

| Lane | Job                                     | Start (derived s) | Finish (derived s) |
| ---- | --------------------------------------- | ----------------- | ------------------ |
| 1    | `native support (macos-aarch64, 1/12)`  | 0                 | 3018               |
| 1    | `native support (macos-aarch64, 7/12)`  | 3018              | 4407               |
| 1    | `test262 (macos-aarch64, 9/12)`         | 4407              | 5682               |
| 1    | `native support (macos-aarch64, 12/12)` | 5682              | 6871               |
| 1    | `native support (macos-aarch64, 10/12)` | 6871              | 7978               |
| 1    | `native (macos-aarch64, 1/3)`           | 7978              | 8828               |
| 2    | `test (macos-latest, node)`             | 0                 | 2875               |
| 2    | `native support (macos-aarch64, 2/12)`  | 2875              | 4281               |
| 2    | `test262 (macos-aarch64, 2/12)`         | 4281              | 5598               |
| 2    | `test262 (macos-aarch64, 7/12)`         | 5598              | 6835               |
| 2    | `test262 (macos-aarch64, 3/12)`         | 6835              | 7957               |
| 2    | `native (macos-aarch64, 2/3)`           | 7957              | 8872               |
| 3    | `host C sanitizers (macOS, native)`     | 0                 | 2197               |
| 3    | `native support (macos-aarch64, 4/12)`  | 2197              | 3644               |
| 3    | `native support (macos-aarch64, 5/12)`  | 3644              | 4963               |
| 3    | `native support (macos-aarch64, 3/12)`  | 4963              | 6218               |
| 3    | `test262 (macos-aarch64, 4/12)`         | 6218              | 7355               |
| 3    | `test262 (macos-aarch64, 1/12)`         | 7355              | 8429               |
| 4    | `test262 (macos-aarch64, 8/12)`         | 0                 | 2007               |
| 4    | `native support (macos-aarch64, 9/12)`  | 2007              | 3563               |
| 4    | `native support (macos-aarch64, 11/12)` | 3563              | 4923               |
| 4    | `native support (macos-aarch64, 6/12)`  | 4923              | 6196               |
| 4    | `test262 (macos-aarch64, 10/12)`        | 6196              | 7350               |
| 4    | `test262 (macos-aarch64, 6/12)`         | 7350              | 8433               |
| 5    | `host C sanitizers (macOS, property)`   | 0                 | 1923               |
| 5    | `test262 (macos-aarch64, 5/12)`         | 1923              | 3559               |
| 5    | `native support (macos-aarch64, 8/12)`  | 3559              | 4929               |
| 5    | `test262 (macos-aarch64, 12/12)`        | 4929              | 6191               |
| 5    | `test262 (macos-aarch64, 11/12)`        | 6191              | 7375               |
| 5    | `native (macos-aarch64, 3/3)`           | 7375              | 8414               |
| 5    | `test (macos-latest, deno)`             | 8414              | 8527               |


Scheduling and cancellation
---------------------------

Only the first job of each lane is initially eligible. Later jobs depend on
the previous job and use `!cancelled()`, so predecessor failure does not skip
coverage. Cancellation stops the remaining lane. The `native` aggregate
uses `always()` and requires success from every Linux matrix and every
explicit macOS native, native support, and test262 job; skipped and cancelled
results fail. Tests execute that predicate for all four result states.

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
corrected workflow awaits a second branch run after the first sample.
Both samples will be recorded by revision, with runner variance and queue
delays left unseparated.

*baseline-check-names.json* records all 58 measured job names from main run
[36516215200]. It was obtained with:

~~~~ sh
gh api repos/dahlia/oseo/actions/runs/36516215200/jobs \
  --paginate --slurp
~~~~

The fixture contains the sorted `name` fields from every page's `jobs` array,
plus the source run and URL. The generator tests compare the rendered names
against this observed list and require every macOS job to have no matrix.

[Linux sanitizer job]: https://github.com/dahlia/oseo/actions/runs/36598029271/job/109507894548
[36516215200]: https://github.com/dahlia/oseo/actions/runs/36516215200
[36598029271]: https://github.com/dahlia/oseo/actions/runs/36598029271


Check name inventory
--------------------

The before column expands the source workflow matrices and matches the
observed baseline fixture; the after column renders the current generated
workflow. No macOS job has a matrix. All 58 names match, including the
aggregate and Linux/Windows checks. The focused generator test repeats this
comparison; explicit job IDs change only for macOS lane dependencies.

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
