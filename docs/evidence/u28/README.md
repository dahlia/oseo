U28 hosted fallback run
=======================

These files support the hosted fallback property deadlines in
[*PLAN-GATE.md*](../../../PLAN-GATE.md) and
[*gate-cost-baseline.md*](../../gate-cost-baseline.md). Main run
`37506307446` at `12394d8a` probed while main run `37499455406` at
`45af71ff` held both Mac lanes, so every Mac-lane job of the later run fell
back to hosted `macos-15`.

 -  *jobs-37499455406-1.tsv* and *jobs-37506307446-1.tsv* are the jobs-API
    rows of the macOS jobs of each run's attempt 1: check name, runner
    name, `started_at`, `completed_at`, and conclusion. They are measured.
    `37499455406` had one attempt; `37506307446` was rerun with `--failed`
    and its attempt 2 passed.
 -  *native-support-properties.tsv* pairs every property of the four
    native support shards that `37499455406` ran on `oseo-mac-2` with the
    same property in the hosted attempt 1 of `37506307446`. The durations
    are the Node test runner's `duration_ms` values from the job logs,
    measured. `hosted_cases_done` is the fast-check count at the interrupt
    for the six interrupted properties of shard 9/12, measured.
 -  *own-key-durations.tsv* holds the `durationMilliseconds` of every
    own-key duration artifact of both runs and of the two all-hosted runs
    `37121778924` and `37167895777`, measured.
 -  *macos-node-own-key.tsv* holds the ordinary own-key property's
    `duration_ms` in the `test (macos-latest, node)` jobs of both runs,
    including the interrupted attempt, and in `test (ubuntu-latest, node)`
    of `37499455406`, measured.
 -  *ratios.py.txt* derives the pooled and per-property hosted/Mac ratios,
    the hosted share of each interrupt limit, and the extrapolated hosted
    need of the interrupted properties from the properties table and the
    current test budgets. *ratios.txt* is its output, derived.

Reproduce from the repository root:

~~~~ sh
python3 -I docs/evidence/u28/ratios.py.txt > docs/evidence/u28/ratios.txt
~~~~
