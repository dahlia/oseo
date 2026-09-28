"""Print measured CI observations and derived aggregates from compact inputs.

Usage: python3 compare-ci.py ci-BEFORE.json.txt ci-AFTER.json.txt [...]
Different totals/assignments are not matched workloads by shard index.
"""
import collections
import json
import math
import re
import statistics
import sys

runs = [json.load(open(path)) for path in sys.argv[1:]]
for host in ['macos-aarch64', 'linux-x86_64-gnu']:
    for family in ['native support', 'test262']:
        print('\n###', host, family)
        print('\nAll row durations are measured minutes from the named run.')
        print('Aggregates and outside-runner differences are derived.')
        print('Shard indices with changed assignments are not matched work.')
        for run in runs:
            print('\n| Run | Shard | Verdict | Archive | Job | Runner |')
            print('| --- | --- | --- | --- | --- | --- |')
            jobs = [job for job in run['jobs'] if host in job['name'] and
                    job['name'].startswith(family + ' (')]
            jobs.sort(key=lambda job: int(re.search(
                r', (\d+)/\d+\)', job['name'])[1]))
            runners = []
            for job in jobs:
                runner = (job['nativeRunnerMilliseconds'] if 'files' in job
                          else float(re.search(
                              r'duration=([\d.]+)ms', job['runner'])[1]))
                runners.append(runner / 60000)
                shard = re.search(r', (\d+/\d+)\)', job['name'])[1]
                print(f"| {run['sourceRun']} | {shard} | "
                      f"{job['conclusion']} | {job['archive']} | "
                      f"{job['jobSeconds'] / 60:.2f} | {runner / 60000:.2f} |")
            elapsed = [job['jobSeconds'] / 60 for job in jobs]
            print(f"\nRun {run['sourceRun']} derived job max/sum: "
                  f"{max(elapsed):.2f}/{sum(elapsed):.2f} min; "
                  f"runner max/sum: {max(runners):.2f}/"
                  f"{sum(runners):.2f} min; outside-runner sum: "
                  f"{sum(elapsed) - sum(runners):.2f} min.")
            if family == 'native support':
                counts = collections.Counter()
                files = []
                costs = []
                for job in jobs:
                    counts.update(job['nativeCounts'])
                    files.extend(job['files'])
                    costs.extend(sum(cases) / 60000
                                 for cases in job['files'].values())
                if len(files) != len(set(files)):
                    raise ValueError('Duplicate native file execution')
                costs.sort()
                print(f"Derived unique selected files: {len(files)}; "
                      f"native summary count sums: {dict(counts)}.")
                print('Derived file case-sum min/median/p90/max min: ' +
                      '/'.join(f'{value:.2f}' for value in [
                          costs[0], statistics.median(costs),
                          costs[math.ceil(len(costs) * .9) - 1], costs[-1]]))
                if any(job['conclusion'] != 'success' for job in jobs):
                    print('FAILED/INCOMPLETE family; interrupted durations '
                          'are censored and generated budgets incomplete.')
            else:
                counts = collections.Counter()
                for job in jobs:
                    counts.update({key: int(value) for key, value in
                                   re.findall(r'(tests|pass|expected-negative|'
                                              r'unsupported)=(\d+)',
                                              job['runner'])})
                built = sum(job['builds']['objectsBuilt'] for job in jobs)
                print(f'Derived classification count sums: {dict(counts)}; '
                      f'derived sum objectsBuilt: {built}.')
