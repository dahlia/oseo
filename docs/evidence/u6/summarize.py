"""Replay deterministic native assignment over measured concurrent case sums.

Run from the repository root: python3 docs/evidence/u6/summarize.py
Output is derived/estimated, never a CI improvement measurement.
"""
import json
import math
import re
import statistics

RUNS = ['39070198868']
# The historical weight-source runs. CI now case-shards two files out of
# the file shards, so the current source observes neither; their weights
# stay retained from these runs, which did observe them.
RETAINED = ['36243816479', '36261458909']
# Replayed without tuning the current weights to them. The first two
# sourced the superseded table; the third was its matching-base comparison.
REPLAYS = RETAINED + ['36312192623']
ROOT = 'docs/evidence/u6/'


def load(run):
    return json.load(open(ROOT + 'ci-' + run + '.json.txt'))


def derive(sources, into=None):
    table = {} if into is None else into
    for run in sources:
        for job in run['jobs']:
            if 'files' not in job:
                continue
            host = job['name'].split('(', 1)[1].split(',')[0]
            entries = table.setdefault(host, {})
            for path, cases in job['files'].items():
                entries[path] = max(entries.get(path, 0),
                                    math.ceil(sum(cases) / 1000))
    return table


runs = [load(run) for run in RUNS]
weights = derive(runs)
# Keep an entry the current source does not observe at its older value
# instead of dropping the file from the model.
for host, entries in derive([load(run) for run in RETAINED]).items():
    for path, cost in entries.items():
        weights.setdefault(host, {}).setdefault(path, cost)
runs.extend(load(run) for run in REPLAYS)


def completion(files, costs, width):
    slots = [0] * width
    for path in files:
        worker = slots.index(min(slots))
        slots[worker] += costs[path]
    return max(slots)


def partition(files, costs, width, total, batches):
    shards = [[] for _ in range(total)]
    ordered = sorted(files, key=lambda path: (-costs[path], path))
    step = width if batches else 1
    for offset in range(0, len(ordered), step):
        loads = [completion(shard, costs, width) if batches else
                 sum(costs[path] for path in shard) for shard in shards]
        shards[loads.index(min(loads))].extend(ordered[offset:offset + step])
    return shards


print('All figures below are derived/estimated minutes from named run logs.')
for run in runs:
    print('\nRun', run['sourceRun'])
    for host, table in weights.items():
        for family in ['native support', 'test262']:
            selected = [job for job in run['jobs'] if host in job['name']
                        and job['name'].startswith(family)]
            elapsed = sum(job['jobSeconds'] for job in selected) / 60
            runner = sum(
                job['nativeRunnerMilliseconds'] / 60000
                if family == 'native support' else float(re.search(
                    r'duration=([\d.]+)ms', job['runner'])[1]) / 60000
                for job in selected)
            print(host, family, 'job/runner/outside-runner sum:',
                  round(elapsed, 2), round(runner, 2),
                  round(elapsed - runner, 2))
        jobs = [job for job in run['jobs'] if 'files' in job and
                host in job['name']]
        costs = {path: sum(cases) / 1000 for job in jobs
                 for path, cases in job['files'].items()}
        width = 3 if host == 'macos-aarch64' else 4
        values = sorted(costs.values())
        print(host, 'file sum distribution s: min/median/p90/max',
              *(round(value, 2) for value in
                [values[0], statistics.median(values),
                 values[math.ceil(len(values) * .9) - 1], values[-1]]))
        before = [completion(job['files'], costs, width) / 60 for job in jobs]
        print('positional model max/sum:', round(max(before), 2),
              round(sum(before), 2))
        for total, batches in [(len(jobs), False), (len(jobs), True),
                               (len(jobs) + 1, True), (len(jobs) + 2, True)]:
            parts = partition(costs, table, width, total, batches)
            after = [completion(part, costs, width) / 60 for part in parts]
            print('batch' if batches else 'LPT', total, 'max/sum/delta:',
                  round(max(after), 2), round(sum(after), 2),
                  round(sum(after) - sum(before), 2))
            if total == len(jobs) and batches:
                for i, part in enumerate(parts, 1):
                    old = next(job for job in jobs if
                               f', {i}/{total})' in job['name'])
                    print('shard', i, 'observed job / old model / new model:',
                          round(old['jobSeconds'] / 60, 2),
                          round(completion(old['files'], costs, width) / 60, 2),
                          round(after[i - 1], 2))
        isolated = 'tests/property/m5-object-own-keys.property.test.ts'
        if host == 'linux-x86_64-gnu' and isolated in costs:
            remaining = {path: cost for path, cost in costs.items()
                         if path != isolated}
            parts = [[isolated]] + partition(
                remaining, table, width, len(jobs), True)
            after = [completion(part, costs, width) / 60 for part in parts]
            print('singleton + batch', len(parts), 'max/sum/delta:',
                  round(max(after), 2), round(sum(after), 2),
                  round(sum(after) - sum(before), 2))
