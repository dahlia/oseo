Self-hosted Mac capacity lane
=============================

Status: configured for one persistent runner, disabled by the repository
variable `OSEO_SELFHOSTED_MAC_ENABLED`. The Mac mini adds one lane to the five
hosted macOS lanes. The coordinator owns registration, repository variables,
secrets, and branch pushes. The operator checklist is outside the repository.


Scheduling
----------

*tools/macos-lane-config.ts* configures exactly one optional `oseo-mac-1`
lane. The generator places only Zig-backed `macos-aarch64` test262, extended
native property, own-key case, and native fixture jobs there. Apple clang
host sanitizer jobs and `macos-latest` Node.js/Deno jobs always use hosted
runners. Every generated macOS job logs `sw_vers -productVersion` before
its test steps. The existing check names, targets, shard totals, seeds,
commands, timeouts, and native aggregate remain required.

The weights in *tools/macos-job-costs.ts* are derived scheduling estimates
from one Mac mini, not runner-mode results. [U21 evidence] observed the same
SHA on hosted and Mac machines, with both cold and warm cache runs and a
repeat Mac sequence. Conservative lower derived ratios are 3.5 for test262,
2.2 for native fixtures, and 2.4 for extended properties including own-key
cases. The model applies ratios only after a derived 60-second fixed setup
share. It starts the Mac lane with an estimated 60-second availability probe.
There is no per-job registration cost: the runner stays registered.
The optional jobs have no predecessor chain. One selected Mac runner accepts
them serially; hosted fallback can use all five hosted slots.
All three own-key case shards use the same readiness decision. Their
duration sum therefore comes from one Mac class, either the selected
`oseo-mac-1` or hosted `macos-15`, and keeps the original hard limit.

An Ubuntu job uses `OSEO_RUNNER_STATUS_TOKEN` with repository
Administration: read to check whether the exact runner label is online and
idle. The repository variable must equal `true`, the event must be a push to
`dahlia/oseo` (any branch or tag), and the secret must exist. Only
collaborators with write access can push there. Otherwise the job emits
hosted `macos-15`.
Pull requests, including fork PRs, always fall back. An API
failure or a busy/offline runner also falls back. A machine that goes offline
after selection can leave a job queued; the operator must disable the switch
and rerun the workflow, preserving the complete gate verdict.
Two overlapping pushes can both observe the runner idle before either starts
its first job. Their selected jobs then queue on the same Mac. The probe is
an availability observation, not a reservation; watch the queue and keep
the switch off during concurrent CI runs.

[U21 evidence]: ./evidence/u21/README.md


Runner service
--------------

The runner is registered once without `--ephemeral` under a dedicated
standard macOS account. The account holds only the runner's own registration
credential. No PAT or GitHub API credential is stored on the Mac. The
operator pins and verifies the downloaded runner archive, registers
`oseo-mac-1` once, and installs the system LaunchDaemon with
*tools/selfhosted-mac/install-service.sh*. The daemon's `UserName` is the
dedicated account; it starts at boot without a GUI login. Its executable is
*bin/Runner.Listener* with the `run` argument. Updates are disabled at
registration, so the operator must update the pinned runner when required.
The installer sets */usr/local*, */usr/local/libexec*, and the hook
directory to mode `755` with owner `root:wheel`. It verifies that the
runner account can execute every hook and owns and can traverse its home.
The installer rejects linked components in the runner root and home; the
hooks reject a linked runner root.
It sets the runner home and root to mode `700` and its `.credentials*`
files to mode `600` after registration. The installer calls
*tools/selfhosted-mac/prepare-service-files.sh* internally; run the
installer, not that helper, for service setup.

The daemon sets `ACTIONS_RUNNER_HOOK_JOB_STARTED` and
`ACTIONS_RUNNER_HOOK_JOB_COMPLETED` to scripts outside the workspace. The
hooks live in root-owned */usr/local/libexec/oseo-runner/* so a job cannot
rewrite them. The start hook clears only the repository checkout, preserving
Actions files and job metadata prepared by the runner. It also removes a
stale own-key duration record if the runner's temp cleanup missed it. At
completion, the hook clears the work tree and the contents of the
runner-managed job temp directory, *\_work/\_temp/*, preserving that
directory itself and registration files. The daemon's
*oseo-temp/* is separate: the live listener keeps .NET pipes and sockets
there, and worker and job processes can leave cache files. Hooks never
clear it. Inspect its size through the health check and remove stale files
only while the daemon is stopped. If free disk falls below 40 GiB on the
256 GiB disk, either hook prunes the Zig cache under the runner account home
reported by the directory service. The hook requires `$HOME` to resolve to that
home and rejects linked home or cache paths. A skipped prune is logged.
The hook removes runner diagnostic logs older than seven days; launchd
output is discarded. Check the daemon, recent diagnostics, and disk with
*tools/selfhosted-mac/health.sh* under `sudo`. Keep the runner account,
root, hook scripts, and logs inaccessible to other standard accounts.
Keep the machine isolated from the home LAN and do not mount personal data
or credentials into jobs.

The operator grants **Developer Tools** to the exact
*bin/Runner.Listener* executable used by the LaunchDaemon. The U17
48-binary first-execution probe must then run as a job through that listener;
SSH results do not verify this path. [U21 evidence] observed 11.29 to
12.90 seconds before an SSH Developer Tools grant and 0.108 to 0.109 seconds
after it. After granting access, restart the daemon with
`sudo launchctl kickstart -k system/org.oseo.runner.oseo-mac-1`, then verify
the grant with the runner probe. In run `37181275283`, attempt 2 before the
restart observed one-worker totals of 14,489 ms for 48 fresh Zig executions
and 497 ms for their second executions. Apple clang's first executions took
13,743 ms. Attempt 3 after the restart observed one-worker totals of
554 ms and 494 ms for Zig, and 544 ms for Apple clang's first executions.
The first-execution penalty was absent; the one-worker runner total
remained above the 108 ms SSH observation. Test262 shard 1/100 observed
58.5 seconds with 60 fragment objects built before the restart, then
25.1 seconds with all 60 reused. Those cache states differ, so the shard
times do not isolate the grant. Attempt 1 logged missing hooks; the
inaccessible parent directory was then identified. Attempts 2 and 3
showed the old hook removing live listener IPC. The revised hook's IPC
preservation has local test evidence only. The operator should
review and remove the earlier SSH-wrapper grant if it is no longer needed.


Security and activation
-----------------------

The repository uses read-only default workflow permissions and requires
approval for all external fork contributors. Inspect fork workflow changes
before approval, especially edits to self-hosted labels, triggers, and
secrets. A PR can modify workflow code, so the generated push condition alone
does not secure the runner. Never expose the availability PAT to a job on
the Mac. Keep a short PAT expiry and rotate it before expiry. Monitor queued
jobs, logs, runner updates, disk, and host sleep behavior.

Keep the switch off for the first branch CI run. After the operator completes
installation, run the U17 probe through the runner and a complete test job.
Then enable the variable for a branch push and compare the same jobs with
hosted results in at least two runs. Label cold and warm cache results and
separate setup from test-step time. Do not treat the U21 one-machine ratios
as measured runner-mode speedups.
