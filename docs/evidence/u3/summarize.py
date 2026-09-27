"""Recompute U3 table values from the retained measured inputs offline."""

import datetime
import json
from pathlib import Path
import re
import statistics

root = Path(__file__).parent


def timestamp(value):
    return datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))


def interval(start, end):
    return (timestamp(end) - timestamp(start)).total_seconds()


for path in sorted(root.glob('ci-*.json.txt')):
    data = json.loads(path.read_text())
    print(data['sourceRun'], data['headSha'])
    for host in ('macos', 'linux'):
        jobs = [job for job in data['jobs'] if job['host'] == host]
        print(host, 'jobs', len(jobs))
        for marker in ('checkout', 'mise-action', 'runtime-archive-cache'):
            seconds = [interval(step['startedAt'], step['completedAt'])
                       for job in jobs for step in job['steps']
                       if marker in step['name']]
            print(marker, 'derived mean', round(statistics.mean(seconds), 2))
        restored = sum('restored' in job['restoreEnd'] for job in jobs)
        restores = [interval(job['restoreStart'].split()[0],
                             job['restoreEnd'].split()[0]) for job in jobs]
        installs = [float(re.search(r'in ([0-9.]+)s',
                                   job['aubeSummary'])[1]) for job in jobs]
        print('restored/missing', restored, len(jobs) - restored,
              'derived restore mean', round(statistics.mean(restores), 2),
              'derived install mean', round(statistics.mean(installs), 2))
        target = ('macos-aarch64' if host == 'macos'
                  else 'linux-x86_64-gnu')
        job = next(job for job in jobs
                   if job['name'] == f'native ({target}, 1/3)')
        print(job['name'], job['toolSummary'], job['aubeSummary'])
        if job['linking']:
            print('derived linking tail', round(interval(
                job['linking'].split()[0],
                job['aubeSummary'].split()[0]), 2))

for path in sorted(root.glob('local-*.json.txt')):
    data = json.loads(path.read_text())
    print(path.name, 'observed fresh store', data['freshStore'])
    times = {entry['label']: entry['seconds'] for entry in data['runs']}
    for index in range(2):
        assert data[f'restoredStore{index}'] == data['freshStore']
        print('trial', index, 'derived restore+install', round(
            times[f'restore-{index}'] + times[f'warm-install-{index}'], 2))
