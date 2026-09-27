"""Recompute U7 costs from the compact preserved timestamp inputs."""

import json
import pathlib

root = pathlib.Path(__file__).parent
for run in [36243816479, 36261458909]:
    evidence = json.loads((root / f'ci-{run}.json.txt').read_text())
    print('RUN', run, evidence['headSha'])
    totals = {}
    for job in evidence['jobs']:
        name = job['name']
        host = ('macOS' if 'macos' in name or 'macOS' in name
                else 'Linux')
        for step in job['steps']:
            # GCC verification has its own workflow name, not this prefix.
            if not step['name'].startswith('Run mise run test:'):
                continue
            task = step['name'].split('mise run ')[1].split()[0]
            key = (host, task)
            totals[key] = totals.get(key, 0) + step['seconds']
        builds = job['laterBuilds']
        if builds:
            print('REBUILD', name, len(builds),
                  f"{sum(row['seconds'] for row in builds):.2f}")
        for task, seconds in job['toolingTestSeconds'].items():
            print('TOOLING', task, f'{seconds:.3f}')
    for key, seconds in sorted(totals.items()):
        print('STEP', *key, seconds)
