U27 two-lane Mac runs
=====================

These files support the measured runs of the two Mac lanes in
[*PLAN-GATE.md*](../../../PLAN-GATE.md) and
[*gate-cost-baseline.md*](../../gate-cost-baseline.md).

 -  *jobs-37398055382-1.tsv* and *jobs-37398055382-2.tsv* are the jobs-API
    rows of both attempts of branch run `37398055382` at `11634e90`: check
    name, runner name, `started_at`, `completed_at`, and conclusion. They are
    measured. The attempts started at 2026-10-06T01:13:17Z and
    2026-10-06T02:33:57Z.
 -  *one-lane/* holds the same rows for one-lane attempts `37251028948` 1,
    `37315038080` 1, and `37332256715` 1, measured.
 -  *own-key-durations.tsv* holds the `durationMilliseconds` of every
    downloadable macOS own-key duration artifact of the eight one-lane
    Mac-lane runs and of attempt 2 of `37398055382`, measured. Each run's
    artifacts belong to its latest attempt that ran the own-key jobs;
    `37332256715` attempt 2 reran only a Linux job, so its records are from
    attempt 1. Attempt 1 of `37398055382` returned HTTP 404 after the rerun.
 -  *pairs.py.txt* derives each Mac job's overlapped pair factor from the
    two-lane rows and the one-lane `oseo-mac-1` medians, taken from these
    one-lane rows and the eight Mac-lane attempts in
    [*u25/model/*](../u25/model/). *pairs.txt* is its output, derived.
 -  *project.ts.txt* derives the lane ends at 41,091 paths from the measured
    two-lane rows and from the U27 model at `11634e90`, and the model's Mac
    lane ends in each attempt's observed pickup order. *project.txt* is its
    output, derived.

The two-lane rows are deliberately outside *u25/model/*:
*tools/macos-lane-report.ts* reads every attempt there as one-lane walls.

Reproduce from the repository root:

~~~~ sh
python3 docs/evidence/u27/pairs.py.txt > docs/evidence/u27/pairs.txt
cp docs/evidence/u27/project.ts.txt tools/u27-project.ts
node tools/u27-project.ts docs/evidence/u27 > docs/evidence/u27/project.txt
rm tools/u27-project.ts
~~~~
