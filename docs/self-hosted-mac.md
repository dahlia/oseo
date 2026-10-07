Self-hosted Mac capacity lane
=============================

Status: configured for two persistent runners on one Mac mini, `oseo-mac-1`
and `oseo-mac-2`, disabled by the repository variable
`OSEO_SELFHOSTED_MAC_ENABLED`. The Mac mini adds two lanes to the five hosted
macOS lanes, one per runner. Both runners are registered: `oseo-mac-1`
earlier and `oseo-mac-2` on 2026-10-06. A lane whose runner is offline,
disabled, or wedged falls back to hosted; a busy lane queues its jobs on the
runner. Branch run `37398055382` measured both lanes; see *PLAN-GATE.md*. The
coordinator owns registration, repository variables, secrets, and branch
pushes. The operator checklist is outside the repository.


Scheduling
----------

*tools/macos-lane-config.ts* configures two optional Mac lanes, `oseo-mac-1`
and `oseo-mac-2`. The generator places only Zig-backed `macos-aarch64` test262,
extended native property, own-key case, and native fixture jobs there. Apple
clang host sanitizer jobs and `macos-latest` Node.js/Deno jobs always use
hosted runners. Every generated macOS job logs `sw_vers -productVersion` before
its test steps. The existing check names, targets, shard totals, seeds,
commands, timeouts, and native aggregate remain required.

The weights in *tools/macos-job-costs.ts* are measured medians of hosted job
walls from seven CI run attempts, two all-hosted and five with the Mac lane
on. A job that has run on `oseo-mac-1` is modeled there by its measured
median Mac wall. Other eligible jobs convert their hosted median by derived
family ratios pooled from those runner-mode attempts: 4.2 for test262, 3.2
for native support, and 3.1 for native fixtures, applied only after a
derived 60-second fixed setup share. The generator places the three own-key
case shards on the `oseo-mac-1` lane first, then the rest longest first. It
starts each Mac lane with an estimated 60-second availability probe.
Because both Mac lanes share one machine, the model slows a Mac job while
the other Mac lane is busy, by the derived pair factor in
`selfHostedPairSlowdowns` for its family and its partner's, and runs it at
its one-lane speed while the other lane is idle. *PLAN-GATE.md* records the
factors and the derived makespans; `node tools/macos-lane-report.ts` prints
them. The earlier
U21 one-machine ratios are kept in [U21 evidence]; *PLAN-GATE.md* records
why they were replaced. There is no per-job registration cost: the runner
stays registered.
The optional jobs have no predecessor chain. Each selected Mac runner accepts
its own lane's jobs serially; hosted fallback can use all five hosted slots.
All three own-key case shards are on the `oseo-mac-1` lane and use its
readiness decision. Their duration sum therefore comes from one Mac class,
either the selected `oseo-mac-1` or hosted `macos-15`, and keeps the original
hard limit.

A lane's `native support` jobs carry a job-level `OSEO_PROPERTY_TIME_SCALE`
read from the same readiness output: 1 on the selected runner, and
`hostedFallbackTimeScale` from *tools/macos-job-costs.ts*, 4, when the lane
fell back to hosted `macos-15` or the probe was skipped. The property budgets
were measured on hosted runners before the lanes existed, and a Mac lane
runs them with two to three times the margin; a fallback job widens only its
interrupt limit back to a comparable margin. Case counts, seeds, sizes, shard
totals, and the failure of an interrupted run do not change. Own-key shards
keep the original limit because their duration record pins it for
`check:property-case-durations`, and test262 and native fixture jobs run no
property. The derivation and the fallback run that motivated it are in
*PLAN-GATE.md* (U28) and [U28 evidence].

An Ubuntu job uses `OSEO_RUNNER_STATUS_TOKEN` with repository
Administration: read to check, once per lane, whether that lane's runner is
usable: exactly one runner carries the lane label, its name is the label, it
carries no other lane's label, and it is online. Busy is not a reason to
fall back. A usable lane is selected while its runner works for the previous
run, and GitHub queues the new run's jobs on the label until the runner
frees up, so a busy lane delays only its own jobs instead of moving them to
slower hosted runners. The repository variable must equal `true`, the event
must be a push to `dahlia/oseo` (any branch or tag), and both the secret and
the workflow token must exist. Only collaborators with write access can push
there. Otherwise the job emits hosted `macos-15`. Pull requests, including
fork PRs, always fall back. An API failure falls back for both lanes; an
offline, unregistered, or ambiguously labeled runner falls back for its own
lane only. Each lane decides independently.

A runner that GitHub lists as online but that is not taking work would hold
its queued jobs, because `timeout-minutes` starts only when a job starts.
The probe therefore also reads the repository's queued and running jobs with
the workflow token (`actions: read`) and compares two observations two
minutes apart. A lane is wedged, and falls back to hosted, when its runner
was idle both times while every job that waited for its label the first
time was still waiting the second time, or busy both times while no job of
its label was running either time. One
observation would misread a handover: U23 measured 2 to 3 seconds between
jobs, during which a runner is idle beside jobs queued long ago. The second
observation happens only when the first shows one of those signatures, so
an ordinary probe makes one pass. What the check does not cover: a runner
that wedges after the probe selected it, and a wedge that the two-minute
window misses. Jobs already queued behind such a runner wait until the
operator disables the switch and reruns the workflow, or until GitHub
cancels a job queued for 24 hours, which fails the run rather than
skipping it. The probe is an observation, not a reservation.

Two concurrent jobs on the same Mac were measured in [U25 evidence] over
SSH, without a second runner. Memory pressure stayed normal and swap did
not grow in the six measured pairings, but each job added 0.9 to 3.8 GiB of
Zig cache files. The 40 GiB prune below removes only the invoking account's
cache, so it does not bound an idle runner's cache. A second runner is
therefore preconditioned on a per-account Zig cache size cap. The hooks
apply one, derived in [U26 evidence] from measurements under `sudo`. The
maintainer installed them for `oseo-mac-1` on 2026-10-06, and branch run
`37360463788` verified the cap; see the next sections. Two runners must use two
accounts: the installer rejects a second runner service with the same account
or root, because the hooks cap only the invoking account's cache. The
maintainer registered `oseo-mac-2` on 2026-10-06 with the steps below.

[U21 evidence]: ./evidence/u21/README.md
[U28 evidence]: ./evidence/u28/README.md
[U25 evidence]: ./evidence/u25/README.md
[U26 evidence]: ./evidence/u26/README.md


Runner service
--------------

Each runner is registered once without `--ephemeral` under its own dedicated
standard macOS account: `oseo-mac-1` under `oseo-runner`, and `oseo-mac-2`
under `oseo-runner2`. The account holds only the runner's own registration
credential. No PAT or GitHub API credential is stored on the Mac. The
operator pins and verifies the downloaded runner archive, registers
`oseo-mac-1` once, and installs the system LaunchDaemon with
*tools/selfhosted-mac/install-service.sh*. `OSEO_RUNNER_LABEL` selects the
runner, `oseo-mac-1` by default or `oseo-mac-2`; any other value is rejected.
The daemon is `org.oseo.runner.<label>`, and the installer requires the
runner root to be registered under that name. The daemon's `UserName` is the
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
only while the daemon is stopped. Either hook removes the Zig cache under
the runner account home reported by the directory service when the cache
exceeds `OSEO_ZIG_CACHE_CAP_GIB`, 30 GiB by default, or when free disk falls
below 40 GiB on the 228 GiB volume. The free-space prune is the backstop
and skips the size measurement. The installer writes the cap into the
LaunchDaemon environment and rejects a value that is not a whole number of
GiB from 1 to 38, the derived two-account ceiling; the hook falls back to 30
GiB for such a value. Measuring a cache near the cap took a measured 1.1 to 3.3
seconds per hook on synthetic trees in [U26 evidence]. The hook requires
`$HOME` to resolve to that home and rejects linked home or cache paths. A
skipped prune or a failed measurement is logged and keeps the cache. The hook
removes runner diagnostic logs older than seven days; launchd output is
discarded. Check the daemon, recent diagnostics, and disk with
*tools/selfhosted-mac/health.sh* under `sudo`. Keep the runner account, root,
hook scripts, and logs inaccessible to other standard accounts. Keep the
machine isolated from the home LAN and do not mount personal data or
credentials into jobs.

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


Installing the updated hooks
----------------------------

The hooks on the Mac change only when the maintainer reruns the installer
under `sudo`. The maintainer ran these steps for `oseo-mac-1` on 2026-10-06,
at about 03:40 KST, with `<commit>` set to main `6654ccf7`. They assume the
runner layout of the original setup: the account `oseo-runner` with its
runner root at */Users/oseo-runner/actions-runner*. Rerun them with the
reviewed main commit whenever the hooks change.

1.  Keep the switch off so no new job selects the runner, and wait until
    `oseo-mac-1` is idle. The installer restarts the daemon, which would end
    a running job.

    ~~~~ sh
    gh variable set OSEO_SELFHOSTED_MAC_ENABLED --body false \
      --repo dahlia/oseo
    gh api repos/dahlia/oseo/actions/runners \
      --jq '.runners[] | select(.name == "oseo-mac-1") | .busy'
    ~~~~

2.  As `dahlia` on the Mac, check out the reviewed commit in a fresh clone.
    Do not commit there.

    ~~~~ sh
    git clone https://github.com/dahlia/oseo.git ~/Desktop/oseo-m5ci-u26
    git -C ~/Desktop/oseo-m5ci-u26 checkout --detach <commit>
    ~~~~

3.  Install the hooks and the LaunchDaemon with the cap, then verify them.

    ~~~~ sh
    sudo env OSEO_RUNNER_ROOT=/Users/oseo-runner/actions-runner \
      OSEO_RUNNER_USER=oseo-runner OSEO_ZIG_CACHE_CAP_GIB=30 \
      bash ~/Desktop/oseo-m5ci-u26/tools/selfhosted-mac/install-service.sh
    sudo /usr/libexec/PlistBuddy \
      -c 'Print :EnvironmentVariables:OSEO_ZIG_CACHE_CAP_GIB' \
      /Library/LaunchDaemons/org.oseo.runner.oseo-mac-1.plist
    cmp ~/Desktop/oseo-m5ci-u26/tools/selfhosted-mac/cleanup.sh \
      /usr/local/libexec/oseo-runner/cleanup.sh
    sudo env OSEO_RUNNER_ROOT=/Users/oseo-runner/actions-runner \
      bash ~/Desktop/oseo-m5ci-u26/tools/selfhosted-mac/health.sh
    ~~~~

The installer restarts the daemon with the same *bin/Runner.Listener*, so
the existing **Developer Tools** grant applies; confirm it with the U17
probe as after any restart. Then re-enable the switch for a branch push and
watch free disk and the hook output in the job logs.

In the 2026-10-06 installation, PlistBuddy printed 30, and `cmp` found the
installed *cleanup.sh* equal to the repository copy. The installer also
printed `chown`/`chmod` “Operation not permitted” for */usr/local*, a
known harmless message: System Integrity Protection refuses that change,
and the copied hooks matched.

Branch run `37360463788` verified the installation on `m5ci-cap-verify`, a
commit whose tree equals main `6654ccf7`. The live cache was a measured
63.6 GiB after run `37315038080`, above the cap. The first Mac job, test262
7/12 (job `111933637542`), entered the job-started hook at 19:02:44Z and
logged `Pruned Zig cache because it exceeded the 30 GiB cap` at 19:08:15Z.
The hook took a measured 5.5 min from entry to that message, measuring and
removing the cache, against the measured 39 seconds for
a synthetic tree of that shape in [U26 evidence], and made the job a
measured 10.0 min. It was a one-off cost of the oversized cache; a later
prune removes the 30 GiB cap plus one job's growth, a derived 33.8 GiB
with U25's measured 3.8 GiB maximum growth, an estimate rather than a
bound, whose removal time has not been measured. The coordinator
observed free disk rise from the measured 92.5 GiB U26 minimum to 155 GiB.
The other 14 Mac jobs took a measured 4.3 to 6.9 min after the cache was
emptied, with no sign of the first-execution penalty after the daemon
restart; the U17 probe was not rerun. All 15 Mac jobs passed, a derived
87.1 min as the sum of their measured durations, measured once. Attempt 1
failed only because three hosted macOS jobs were never acquired by a hosted
runner (“The job was not acquired by Runner of type hosted even after multiple
attempts”); the `--failed` rerun, attempt 2, passed.


Adding the second runner
------------------------

`oseo-mac-2` runs on the same Mac mini as `oseo-mac-1`. The steps that
need `sudo` or GitHub credentials are the maintainer's. The maintainer ran
them on 2026-10-06; the record follows the steps. What differs from
`oseo-mac-1`:

 -  The account is `oseo-runner2`, a second standard account, with its own
    home, runner root, `TMPDIR` (*oseo-temp/*), mise tools, runtime archive
    directory, and Zig cache under that home.
 -  The runner name and its only custom label are `oseo-mac-2`, and the
    LaunchDaemon is `org.oseo.runner.oseo-mac-2`.
 -  `OSEO_RUNNER_LABEL=oseo-mac-2` is passed to the installer and the health
    check. Everything else in the LaunchDaemon has the same shape as
    `oseo-mac-1`'s, including the 30 GiB `OSEO_ZIG_CACHE_CAP_GIB`.
    *tests/fixtures/selfhosted-mac/* holds both expected property lists, and
    the installer's `--print-plist` mode reproduces them without `sudo`.
 -  Both runners share the root-owned hooks in
    */usr/local/libexec/oseo-runner/*. Installing either runner reinstalls them
    from the same reviewed commit.

As `dahlia`, check out the reviewed main commit that contains this two-lane
configuration in a fresh clone, as in the previous section, and set `src` to
it in the shell used below. Do not commit there.

~~~~ sh
git clone https://github.com/dahlia/oseo.git ~/Desktop/oseo-m5ci-u27
git -C ~/Desktop/oseo-m5ci-u27 checkout --detach <commit>
src=~/Desktop/oseo-m5ci-u27
~~~~

1.  Keep the switch off and wait until `oseo-mac-1` is idle, as above.
    Installing the second service rewrites the shared hooks but restarts
    only `org.oseo.runner.oseo-mac-2`.

2.  Create the standard account and its home. Do not add it to the `admin`
    group; the installer rejects an administrator.

    ~~~~ sh
    sudo sysadminctl -addUser oseo-runner2 -fullName 'Oseo runner 2' \
      -password -
    sudo createhomedir -c -u oseo-runner2
    ~~~~

3.  As `oseo-runner2`, extract the same runner archive that `oseo-mac-1`
    uses, v2.337.0 for macOS ARM64, after verifying it against the checksum
    the operator recorded for `oseo-mac-1` and placing it where
    `oseo-runner2` can read it, such as */Users/Shared/*. Then register it
    once with a repository registration token, without `--ephemeral` and
    with updates disabled. The default `self-hosted`, `macOS`, and `ARM64`
    labels remain.

    ~~~~ sh
    sudo -u oseo-runner2 -H bash -c '
      mkdir ~/actions-runner && cd ~/actions-runner &&
      tar xzf /Users/Shared/actions-runner-osx-arm64-2.337.0.tar.gz'
    sudo -u oseo-runner2 -H bash -c '
      cd ~/actions-runner &&
      ./config.sh --unattended --url https://github.com/dahlia/oseo \
        --token <registration token> --name oseo-mac-2 \
        --labels oseo-mac-2 --disableupdate'
    ~~~~

4.  Lock down the home, root, and credentials. The installer repeats this,
    and also checks it.

    ~~~~ sh
    sudo chmod 700 /Users/oseo-runner2 /Users/oseo-runner2/actions-runner
    sudo chmod 600 /Users/oseo-runner2/actions-runner/.credentials*
    ~~~~

5.  Install the LaunchDaemon with the cap, then compare it with the reviewed
    property list and run the health check.

    ~~~~ sh
    sudo env OSEO_RUNNER_LABEL=oseo-mac-2 \
      OSEO_RUNNER_ROOT=/Users/oseo-runner2/actions-runner \
      OSEO_RUNNER_USER=oseo-runner2 OSEO_ZIG_CACHE_CAP_GIB=30 \
      bash "$src/tools/selfhosted-mac/install-service.sh"
    sudo cat /Library/LaunchDaemons/org.oseo.runner.oseo-mac-2.plist |
      cmp - "$src/tests/fixtures/selfhosted-mac/oseo-mac-2.plist"
    sudo env OSEO_RUNNER_LABEL=oseo-mac-2 \
      OSEO_RUNNER_ROOT=/Users/oseo-runner2/actions-runner \
      bash "$src/tools/selfhosted-mac/health.sh"
    ~~~~

6.  Grant **Developer Tools** to
    */Users/oseo-runner2/actions-runner/bin/Runner.Listener*, as for
    `oseo-mac-1`, then restart the daemon so the grant applies:

    ~~~~ sh
    sudo launchctl kickstart -k system/org.oseo.runner.oseo-mac-2
    ~~~~

7.  Confirm that the API lists `oseo-mac-2` online with exactly that custom
    label. Then run the U17 first-execution probe through it and a
    two-attempt branch run with the switch on, and watch free disk during
    the first runs: [U26 evidence] measured only one runner account.

    ~~~~ sh
    gh api repos/dahlia/oseo/actions/runners \
      --jq '.runners[] | {name, status, busy, labels: [.labels[].name]}'
    ~~~~

On 2026-10-06 the maintainer ran these steps for `oseo-mac-2` with
*/Users/Shared/oseo-runner-staging/setup-mac2.sh*, a script outside the
repository, from a checkout at `11634e90`. As reported to the coordinator,
it created `oseo-runner2` with a random password, extracted runner archive
v2.337.0 after verifying its checksum, and registered it with
`--name oseo-mac-2 --labels oseo-mac-2 --disableupdate`. It then applied the
lockdown and ran *install-service.sh* with `OSEO_RUNNER_LABEL=oseo-mac-2` and
the 30 GiB cap, and compared the installed property list with the fixture. The
maintainer granted **Developer Tools** to that runner's *Runner.Listener* and
restarted its daemon. The API then listed both runners online, each with
exactly its own custom label. Of step 7, the API check and the
two-attempt branch run below were done, and the coordinator observed free
disk after the runs; the U17 probe was not run through `oseo-mac-2` and remains
outstanding.
In branch run `37398055382` its test262 jobs took a derived 1.00 to 1.40 times
their one-lane `oseo-mac-1` medians, so no penalty of the size seen before the
`oseo-mac-1` grant appeared, but that run does not isolate one.

Branch run `37398055382` at `11634e90` then ran with both runners. Both
attempts passed every macOS job and ended their last job a measured 79.6
and 78.9 min after starting. Attempt 1 was red only in a Linux-hosted job,
so only attempt 2's 78.9 min is a push-to-green time. `oseo-mac-1`
ran 10 jobs and `oseo-mac-2` 9 in each attempt, as generated. The
coordinator measured 115 GiB free on the Mac after the runs. *PLAN-GATE.md*
records the lane ends, pair slowdowns, own-key durations, and projection.

While `oseo-mac-2` is offline, disabled, or wedged, its lane's nine jobs
fall back to hosted `macos-15` without a predecessor chain and compete with
the five hosted lanes for the five hosted slots. That fallback schedule is
not modeled; the three measured fallbacks in [U29 evidence] ended their
lane jobs 159.0 to 197.5 min after the run started, against 72.3 to 81.4
min on the lanes. The lane's native support jobs then run with the
fallback time scale above. While `oseo-mac-2` is merely busy, its jobs
queue behind the previous run's: *PLAN-GATE.md* (U29) derives the wait.

[U29 evidence]: ./evidence/u29/README.md


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
