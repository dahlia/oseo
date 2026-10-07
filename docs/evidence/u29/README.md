U29 lane queue versus hosted fallback
=====================================

These files support the change that routes a Mac lane's jobs to its runner
label while the runner is busy, instead of sending the whole lane to hosted
`macos-15`, in [*PLAN-GATE.md*](../../../PLAN-GATE.md) and
[*gate-cost-baseline.md*](../../gate-cost-baseline.md).

 -  *jobs-RUN-1.tsv* are the jobs-API rows of the macOS jobs of attempt 1
    of five main runs: check name, runner name, requested labels,
    `created_at`, `started_at`, `completed_at`, and conclusion. They are
    measured. `37499455406` and `37581978950` ran their 19 Mac-lane jobs on
    the two Mac runners; `37506307446`, `37575037950`, and `37606214007`
    probed while a runner was busy and ran them hosted. `37506307446` was
    rerun with `--failed`; its attempt 2 is in [*u28*](../u28/README.md).
    A job's queue wait is `started_at` minus `created_at`; the lane jobs of
    one run are created together when the readiness job ends.
 -  *wait.py.txt* derives, per attempt, the summed walls, queue waits, and
    last end of the lane jobs on each runner class and of the 15 hosted-lane
    macOS jobs, then the queue model: a push G minutes after a run that holds
    the lanes waits for that run's remaining lane work and then runs its own.
    *wait.txt* is its output, derived.

Reproduce from the repository root:

~~~~ sh
python3 -I docs/evidence/u29/wait.py.txt > docs/evidence/u29/wait.txt
~~~~

The live observation on 2026-10-07 is recorded in *PLAN-GATE.md* from
`gh api` output at 14:57Z and is not reproducible from these files.
