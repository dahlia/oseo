"""Retain U3 setup-step and runner-marker inputs from historical CI.

Usage: python3 extract-ci.py RUN JOBS_JSON LOGS_ZIP > compact.json.txt
Only reads saved inputs; does not install, build or access the network.
"""

import json
import re
import sys
import zipfile

run, jobs_path, logs_path = sys.argv[1:]
with open(jobs_path) as source:
    response = json.load(source)
output = {'sourceRun': run, 'headSha': response['headSha'], 'jobs': []}
with zipfile.ZipFile(logs_path) as archive:
    for job in response['jobs']:
        name = job['name']
        lower = name.lower()
        host = ('macos' if 'macos' in lower else
                'linux' if 'linux' in lower or 'ubuntu' in lower else None)
        if host is None:
            continue
        expression = r'\d+_' + re.escape(name.replace('/', '_')) + r'\.txt'
        matches = [path for path in archive.namelist()
                   if re.fullmatch(expression, path)]
        if len(matches) != 1:
            raise ValueError(f'Expected one log for {name}: {matches}')
        rows = [re.sub(r'\x1b\[[0-9;]*m', '', row)
                for row in archive.read(matches[0]).decode().splitlines()]

        def first(predicate, required=True):
            match = next((row for row in rows if predicate(row)), None)
            if required and match is None:
                raise ValueError(f'Missing marker in {name}')
            return match

        steps = [{key: step[key] for key in
                  ('name', 'startedAt', 'completedAt')}
                 for step in job['steps']
                 if not step['name'].startswith('Post ')
                 and any(marker in step['name'] for marker in
                         ('checkout', 'mise-action', 'runtime-archive-cache'))
                 and step['conclusion'] != 'skipped']
        progress = ([row for row in rows if 'extracting' in row]
                    if name == 'test262 (macos-aarch64, 6/10)' else [])
        output['jobs'].append({
            'coldExtractProgress': progress,
            'name': name,
            'id': job['databaseId'],
            'host': host,
            'steps': steps,
            'miseActionRevision': first(
                lambda row: "Download action repository 'jdx/mise-action"
                in row),
            'cacheInput': first(lambda row: '  cache: true' in row),
            'restoreStart': first(lambda row: 'Restoring mise cache' in row),
            'restoreEnd': first(lambda row:
                                'mise cache restored from key:' in row or
                                'mise cache not found for' in row),
            'toolSummary': first(lambda row:
                                 '9/9' in row and 'installed' in row),
            'aubeSummary': first(lambda row:
                                 '[deps.aube]' in row and '✓ resolved' in row),
            'linking': first(lambda row:
                             '[deps.aube]' in row and '· linking' in row,
                             required=False),
        })
print(json.dumps(output, indent=2))
