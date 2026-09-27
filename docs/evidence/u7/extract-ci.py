"""Extract U7 timing sources from saved GitHub JSON and ZIP logs.

Usage: python3 extract-ci.py RUN JOBS_JSON LOGS_ZIP > compact.json.txt
Only reads the supplied historical evidence; makes no network requests.
"""

import datetime
import json
import re
import sys
import zipfile


def seconds(start, end):
    def parse(value):
        return datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    return (parse(end) - parse(start)).total_seconds()


run, response_path, archive_path = sys.argv[1:]
with open(response_path) as source:
    response = json.load(source)
output = {'sourceRun': run, 'headSha': response['headSha'], 'jobs': []}
with zipfile.ZipFile(archive_path) as archive:
    for job in response['jobs']:
        name = job['name']
        if 'windows' in name or name == 'native':
            continue
        log_name = name.replace('/', '_')
        matches = [entry for entry in archive.namelist()
                   if re.fullmatch(r'\d+_' + re.escape(log_name) + r'\.txt',
                                   entry)]
        if len(matches) != 1:
            raise ValueError(f'Expected one log for {name}: {matches}')
        rows = [re.sub(r'\x1b\[[0-9;]*m', '', line)
                for line in archive.read(matches[0]).decode().splitlines()]
        starts = [index for index, line in enumerate(rows)
                  if '[build] $ aube exec -- tsdown --workspace' in line]
        builds = []
        for index in starts[1:]:
            end = next(line for line in rows[index + 1:]
                       if re.search(r'\[test:[^\]]+\] \$', line))
            start_time = rows[index].split()[0]
            end_time = end.split()[0]
            builds.append({
                'start': start_time, 'end': end_time,
                'endMarker': re.search(r'\[test:[^\]]+\] \$', end)[0],
                'seconds': seconds(start_time, end_time),
            })
        steps = []
        for step in job['steps']:
            if step['conclusion'] == 'skipped':
                continue
            if ('mise run' not in step['name'] and
                    'Verify GCC sanitizer' not in step['name']):
                continue
            steps.append({
                'name': step['name'], 'start': step['startedAt'],
                'end': step['completedAt'],
                'seconds': seconds(step['startedAt'], step['completedAt']),
            })
        tooling = {}
        if name == 'check':
            for line in rows:
                match = re.search(
                    r'\[check:(anti-slop|native-toolchains|'
                    r'native-host-guards)\].*duration_ms ([0-9.]+)', line)
                if match:
                    tooling[match[1]] = float(match[2]) / 1000
        output['jobs'].append({
            'name': name, 'id': job['databaseId'], 'steps': steps,
            'laterBuilds': builds, 'toolingTestSeconds': tooling,
        })
print(json.dumps(output, indent=2))
