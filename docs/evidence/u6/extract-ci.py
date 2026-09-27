"""Read historical CI jobs/logs and U8's historical registration index.

Usage: python3 extract-ci.py RUN JOBS_JSON LOGS_ZIP NAMES_JSON
Case milliseconds are measured; per-file sums are derived scheduling weights.
"""
import datetime
import json
import re
import sys
import zipfile

run, jobs_path, logs_path, names_path = sys.argv[1:]
with open(jobs_path) as source:
    jobs = json.load(source)
with open(names_path) as source:
    names = json.load(source)
patterns = [(item['path'], re.compile('^' + pattern + '$'))
            for item in names for pattern in item['patterns']]


def seconds(start, end):
    return (datetime.datetime.fromisoformat(end) -
            datetime.datetime.fromisoformat(start)).total_seconds()


output = {'sourceRun': run, 'headSha': jobs['headSha'], 'jobs': []}
with zipfile.ZipFile(logs_path) as archive:
    for job in jobs['jobs']:
        name = job['name']
        if not name.startswith(('native support (', 'test262 (')):
            continue
        entry = next(path for path in archive.namelist() if re.fullmatch(
            r'\d+_' + re.escape(name.replace('/', '_')) + r'\.txt', path))
        rows = [re.sub(r'\x1b\[[0-9;]*m', '', row)
                for row in archive.read(entry).decode().splitlines()]
        item = {'name': name, 'id': job['databaseId'],
                'jobSeconds': seconds(job['startedAt'], job['completedAt']),
                'archive': 'cold' if any('Cache not found for input keys: '
                                        'oseo-runtime' in row for row in rows)
                else 'warm'}
        if name.startswith('test262 ('):
            item['runner'] = next(row.split('Z ', 1)[1] for row in rows
                                  if 'duration=' in row and 'pool=' in row)
            builds = next((row.split('test262-builds ', 1)[1] for row in rows
                           if 'test262-builds {' in row), None)
            if builds is not None:
                item['builds'] = json.loads(builds)
        else:
            command = next(row for row in rows
                           if '$ node tools/run-native-tests.ts' in row)
            files = re.findall(r'tests/property/[\w.-]+\.ts', command)
            marker = next((row.split('native-shard ', 1)[1] for row in rows
                           if 'native-shard {' in row), None)
            if marker is None:
                index, total = map(int, re.search(
                    r'--test-shard=(\d+)/(\d+)', command).groups())
                selected = files[index - 1::total]
            else:
                metadata = json.loads(marker)
                selected = metadata['files']
                item['workers'] = metadata['workers']
            item['files'] = {path: [] for path in selected}
            active = False
            for row in rows:
                if row == command:
                    active = True
                if not active:
                    continue
                summary = re.search(r'ℹ duration_ms ([\d.]+)', row)
                if summary is not None:
                    item['nativeRunnerMilliseconds'] = float(summary[1])
                case = re.search(r'✔ (.+) \(([\d.]+)ms\)', row)
                if case is None:
                    continue
                title, duration = case.groups()
                matches = {path for path, pattern in patterns
                           if path in selected and pattern.fullmatch(title)}
                if not matches:
                    matches = {entry['path'] for entry in names
                               if entry['path'] in selected and any(
                                   re.fullmatch(pattern, title)
                                   for pattern in entry['literals'])}
                if len(matches) != 1:
                    raise ValueError(f'Cannot map {name}: {title}: {matches}')
                item['files'][matches.pop()].append(float(duration))
            if any(not cases for cases in item['files'].values()):
                raise ValueError(f'Missing file cases: {name}')
        output['jobs'].append(item)
print(json.dumps(output, indent=2))
