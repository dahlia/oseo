Ordinary Node shard placement
=============================

The ordinary Node.js gate kept every file, case, seed, budget, and interrupt
limit. What changed is which shard runs each file: Linux moved from Node's
positional `--test-shard=INDEX/2` to four weighted shards, and macOS from
four positional shards to six weighted ones. *tools/node-shard.ts* now
assigns files on both hosts by the weights in *tools/node-shard-costs.ts*.
The dedicated macOS Array job and the unsharded Windows job are unchanged.


Problem
-------

Run [41228695658] at `9f21b607`, run [41233967056] at `636157ef`, and run
[41238903460] at `8770b2e4` took 41.2, 53.3, and 56.0 minutes for
`test (ubuntu-latest, node, 2/2)`, while shard 1/2 took 30.6 to 37.7. The
macOS shards took 9.3 to 42.7 minutes. Node's positional partition sends
every second file in sorted path order to a shard, so the heavy native
evidence files fall where their names put them. Node also sorts the files
it is given and starts each on the first free worker, so a heavy file late
in path order starts only after the files before it. The shard ends when
that file does.

[41228695658]: https://github.com/dahlia/oseo/actions/runs/41228695658
[41233967056]: https://github.com/dahlia/oseo/actions/runs/41233967056
[41238903460]: https://github.com/dahlia/oseo/actions/runs/41238903460


Measurement
-----------

*extract.py* reads the 18 ordinary Node job logs of those three runs, which
were fetched with `gh api repos/dahlia/oseo/actions/jobs/JOB/logs`. The
logs are not checked in. The spec reporter prints top-level results without
file names, so the script recomputes each job's file list from the run's
commit and partition. A result goes to the file whose literal `test` name,
with template substitutions as wildcards, matches it completely and most
specifically. Results that only a computed name can explain fall back to
the longest string-literal fragment among files that compute names.

Node prints each file's results as one block in sorted path order, which
checks the attribution. Where two files register the same name, the result
goes to the one candidate that sorts between its attributed neighbors. The
script stops on any unmatched or still ambiguous result, and on any job
whose attributed files leave sorted order, so a result credited to the
wrong file fails the extraction. All 18 jobs pass. *node-file-costs.tsv*
holds the resulting sums in seconds, one column per host and run. They are
concurrent test durations, not file walls or CPU time.

The same file's sum varies with the runner. The residual evidence file,
*tests/dynamic-source-residual-evidence.test.ts*, summed to 1,512.3,
2,054.9, and 2,045.5 seconds on Linux, a factor of 1.36, and to 1,098.5,
1,562.0, and 1,575.7 on macOS. A weight is therefore the largest of the
three sums, rounded up, so the margin below is a slow runner's. Files under 30
seconds have no entry and weigh the host fallback, 18 seconds on both hosts,
which is the median of every measured weight.

Thirty-seven files postdate those runs. Local runs from 2026-11-01 to
2026-11-04 of the residual evidence and those files, on one host, give the
calibration:

| File                                                         | Local, s | Linux weight | macOS weight |
| ------------------------------------------------------------ | -------: | -----------: | -----------: |
| *tests/dynamic-source-residual-evidence.test.ts*             |    798.3 |   2,055 (CI) |   1,576 (CI) |
| *tests/host-script-evidence.test.ts*                         |    290.8 |          749 |          574 |
| *tests/trainc-ordinary-evidence.test.ts*                     |    155.2 |          400 |          307 |
| *tests/unhandled-rejection-policy-native.test.ts*            |      9.5 |     fallback |     fallback |
| *tests/host-script-trainc-evidence-1.test.ts*                |    335.4 |          864 |          663 |
| *tests/host-script-trainc-evidence-2.test.ts*                |    291.9 |          752 |          577 |
| *tests/host-script-trainc-evidence-3.test.ts*                |    284.2 |          732 |          561 |
| *tests/host-script-trainc-evidence-4.test.ts*                |    261.2 |          673 |          516 |
| *tests/function-constructor-evidence.test.ts*                |     55.5 |          143 |          110 |
| *tests/legacy-caller.test.ts*                                |     26.9 |           70 |           54 |
| *tests/property/m5-annexb-escape.property.test.ts*           |     33.7 |           87 |           67 |
| *tests/property/m5-annexb-string-methods.property.test.ts*   |     14.2 |           37 |     fallback |
| *tests/property/m5-annexb-date-methods.property.test.ts*     |     12.2 |           32 |     fallback |
| *tests/es2026-builtins-native.test.ts*                       |     37.8 |           98 |           75 |
| *tests/property/es2026-error-is-error.property.test.ts*      |     11.5 |     fallback |     fallback |
| *tests/property/es2026-math-sum-precise.property.test.ts*    |      9.5 |     fallback |     fallback |
| *tests/property/es2026-upsert.property.test.ts*              |     26.1 |           68 |           52 |
| *tests/property/es2026-iterator-concat.property.test.ts*     |     14.5 |           38 |     fallback |
| *tests/property/es2026-iterator-zip.property.test.ts*        |     22.9 |           60 |           46 |
| *tests/annexb-object-accessors-native.test.ts*               |     30.8 |           80 |           61 |
| *tests/property/m5-annexb-object-accessors.property.test.ts* |     38.0 |           98 |           75 |
| *tests/annexb-proto-boundary.test.ts*                        |    135.5 |          349 |          268 |
| *tests/annexb-legacy-lookup-boundary.test.ts*                |     37.3 |           97 |           74 |
| *tests/array-from-async-native.test.ts*                      |     20.2 |           53 |           40 |
| *tests/property/es2026-array-from-async.property.test.ts*    |     34.1 |           88 |           68 |
| *tests/json-parse-source-native.test.ts*                     |     44.5 |          115 |           88 |
| *tests/property/es2026-json-parse-source.property.test.ts*   |     58.2 |          150 |          115 |
| *tests/uint8array-base64-native.test.ts*                     |     18.4 |           48 |           37 |
| *tests/property/es2026-uint8array-base64.property.test.ts*   |     18.0 |           47 |           36 |
| *tests/atomics-pause-native.test.ts*                         |      6.9 |     fallback |     fallback |
| *tests/disposal-intrinsics-native.test.ts*                   |     21.8 |           57 |           43 |
| *tests/property/es2027-disposal-intrinsics.property.test.ts* |     21.3 |           55 |           42 |
| *tests/using-declarations-native.test.ts*                    |     28.7 |           74 |           57 |
| *tests/property/es2027-using-declarations.property.test.ts*  |     40.2 |          104 |           80 |
| *tests/annexb-syntax-native.test.ts*                         |     20.6 |           53 |           41 |
| *tests/property/m5-annexb-regexp-syntax.property.test.ts*    |     32.6 |           84 |           65 |

The ratios are 2.574 for Linux and 1.974 for macOS, the residual file's
largest CI sum over its local sum. The fastest Linux observation gives
1.894, so the ratio spans the runner variation as well.

The three Annex B property files' local figures are their ordinary suites'
summed top-level test durations, taken with one file worker. The
*tests/es2026-builtins-native.test.ts* figure is a 2026-11-04 rerun with the
four Iterator.zip fixtures; its five earlier fixtures took 22.4 of the 37.8
seconds in that run against 13.0 before, so the host was slower that day and
the entry errs high. The escape
suite's first run, directly after a build, took 56.4 seconds; the table uses
its second run, like the other two files' runs on the same warm cache.

The four Annex B Object accessor files were measured on 2026-11-04 while other
lanes kept the host's load average between 31 and 62 on 16 cores, so they may
be high. The property file and the lookup test ran as two file workers side by
side; the other two ran alone. *tests/annexb-proto-boundary.test.ts* and
*tests/annexb-legacy-lookup-boundary.test.ts* replace their earlier CI weights
because the unit rewrote both files to compare the implemented behavior with
the references.


Model
-----

*model.py* replays Node's runner. A shard's files start in sorted path
order, each on the first free of three Linux or two macOS workers, which is
Node's default file concurrency on the hosted runners: available
parallelism minus one. One minute of setup is added. With each job's own
sums, it reproduces the positional jobs of the three runs:

| Job                    | Actual, minutes        | Model, minutes         |
| ---------------------- | ---------------------- | ---------------------- |
| Linux, run 41228695658 | 37.7, 41.2             | 37.8, 41.4             |
| Linux, run 41233967056 | 30.6, 53.3             | 30.7, 53.4             |
| Linux, run 41238903460 | 37.4, 56.0             | 37.5, 56.1             |
| macOS, run 41228695658 | 16.6, 9.3, 38.8, 30.7  | 16.6, 16.5, 38.1, 30.6 |
| macOS, run 41233967056 | 21.3, 26.2, 42.7, 39.5 | 21.1, 26.0, 41.8, 39.1 |
| macOS, run 41238903460 | 17.1, 20.6, 41.1, 40.1 | 17.1, 20.5, 40.4, 40.0 |

The one miss is shard 2/4 of run 41228695658. It summed 1,902.7 seconds of
tests in a 521-second test step, which two workers cannot do. That runner
evidently ran more files at once than the others, so the model is
conservative there.

The placement uses the same model. Files are taken heaviest first, ties in
path order, and each goes to the shard whose modeled run ends earliest with
it, ties to the lowest index. Passing files in a different order cannot
change Node's sorted start order, so the placement models it instead.


Modeled maxima
--------------

On the bundle 8 tree with the train C evidence pieces, in minutes including
setup. The weights column uses
the checked-in weights and fallback. The sums column uses each file's
largest observed sum, with the fallback only for files never observed:

| Host and total    | Weights                            | Largest sums                       |
| ----------------- | ---------------------------------- | ---------------------------------- |
| Linux, 3          | 44.5, 44.5, 44.4                   | 40.5, 40.2, 40.4                   |
| Linux, 4 (chosen) | 35.2, 35.2, 35.1, 35.3             | 35.2, 33.0, 33.4, 33.0             |
| macOS, 5          | 35.5, 35.5, 35.6, 35.6, 35.4       | 32.1, 32.1, 32.1, 32.4, 33.0       |
| macOS, 6 (chosen) | 29.7, 29.6, 29.7, 29.7, 29.6, 29.7 | 28.0, 27.4, 27.3, 26.9, 27.7, 27.4 |

The Linux floor is the residual evidence file, which takes shard 1 alone at
35.2 minutes. The same files and sums under the old positional partition
model at 63.1 and 58.0 minutes for Linux and 52.6, 21.9, 47.7, and 39.3 for
macOS.

The macOS total follows from the hosted lanes. The lane generator keeps the
`test` family off Mac lanes, and two of the five hosted lanes each hold one
sanitizer job, so the ordinary Node shards share three lanes with the Deno
and Array jobs. With each shard's modeled wall from per-file medians and
eight configured Mac lanes, the generator models these maxima:

| Placement                            | Shard walls, s                           | Run maximum, minutes |
| ------------------------------------ | ---------------------------------------- | -------------------: |
| Positional 4, checked-in U40 entries | 884, 996, 1,311, 864                     |                40.87 |
| Positional 4, modeled on this tree   | 2,485, 1,052, 1,369, 2,641               |                44.35 |
| Weighted 4                           | 1,872, 1,915, 1,833, 1,879               |                61.75 |
| Weighted 5                           | 1,646, 1,522, 1,543, 1,475, 1,501        |                50.38 |
| Weighted 6 (chosen)                  | 1,622, 1,339, 1,273, 1,254, 1,387, 1,224 |                47.43 |

The checked-in positional entries summed to 4,055 seconds, against 5,717
to 7,788 for the same four jobs in the three runs, so the 40.87 figure was
optimistic. The positional shards fit three lanes only because they were
uneven. Equal weighted shards pack two per lane at most, which makes six
the smallest total that leaves no lane with a third shard. The floor of
about 47 minutes is the hosted Node, Deno, and Array work divided by three.
*tools/macos-job-costs.ts* records the six walls as derived entries until
CI measures them.

These maxima predate the merge of the `dynamic-source-regexp-exhaustive`
lane, which splits the macOS native sanitizer job in two and chains a
dedicated RegExp literal sanitizer job on the property sanitizer lane. With
both changes the property sanitizer lane, at 4,264 seconds, sets the run
maximum, and the three Node lanes model at 45.8 to 47.5 minutes.

The same runs observed the macOS `property` sanitizer job at a median of
2,823 seconds, against a checked-in entry of 2,452, and the unsplit
`native` job at 3,377. Those entries belong to the sanitizer split and are
not refreshed here.


Coming files
------------

The train C host Script evidence runs its 34 fixtures in four files of 13,
5, 6, and 10 fixtures, contiguous in fixture order, which
*tests/host-script-trainc-evidence.ts* registers. As one file it took
1,160.6 seconds locally, 49.8 minutes on a slow Linux runner by the ratio
above, so no placement could bring its job under 40 minutes. Each piece
carries its scaled weight from the table above.

*tests/property/m5-regexp-literal-exhaustive.property.test.ts* no longer
runs in these shards. It entered them without a weight, at a local estimate
of 248 seconds. Beside other file workers CI measured 543 to 1,071 seconds
for its four properties on Linux and 386 to 1,649 on macOS, and both attempts
of one macOS shard interrupted a property at its limit. `dedicatedNodeFiles`
now removes it on both hosts, and it runs in one dedicated job per host; see
[*ordinary exhaustive RegExp placement*](../regexp-exhaustive-node/README.md).

Capacity remains a concern. The train C pieces add 2,317 weighted seconds
to the three hosted macOS lanes that carry Node shards, which would put the
run maximum near 60 minutes whatever the Node total is. That needs a
separate decision about hosted macOS capacity.


Reproduction
------------

~~~~ sh
python3 docs/evidence/node-shards/extract.py LOG_DIR \
  > docs/evidence/node-shards/node-file-costs.tsv
python3 docs/evidence/node-shards/model.py
python3 docs/evidence/node-shards/model.py --emit
~~~~

`--emit` prints the weight tables in *tools/node-shard-costs.ts*.
*model.py* discovers files from the checked-out tree, so its maxima follow
the tree it runs in. The lane maxima above come from the lane generator
with the shard walls listed. The checked-in workflow reflects the six
derived entries.
