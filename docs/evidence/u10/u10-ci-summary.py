"""Original U10 CI extraction algorithm, wrapped for preservation."""
import datetime
import json
import pathlib
import re

out = {}
for run in [35456667007, 35463308291, 35493049199]:
    rows = []
    response = json.load(open(f'/tmp/u10-ci-{run}.json'))
    for job in response['jobs']:
        if not ('test262' in job['name'].lower() and
                'macos' in job['name'].lower()):
            continue
        path = f'/tmp/u10-evidence/ci-{run}-{job["databaseId"]}.log'
        log = pathlib.Path(path).read_text()
        if not log:
            continue
        builds = re.findall(r'test262-builds (\{[^\n]+\})', log)
        final = re.findall(r'test262 revision=[^\n]+', log)
        step = next(s for s in job['steps'] if 'test:test262' in s['name'])
        start = datetime.datetime.fromisoformat(
            step['startedAt'].replace('Z', '+00:00'))
        end = datetime.datetime.fromisoformat(
            step['completedAt'].replace('Z', '+00:00'))
        restore = next((l.split('Z ', 1)[-1] for l in log.splitlines()
                        if 'Cache restored from key: oseo-runtime-' in l),
                       None)
        rows.append({
            'job': job['databaseId'], 'name': job['name'],
            'stepSeconds': (end - start).total_seconds(),
            'builds': json.loads(builds[-1]) if builds else None,
            'final': final[-1] if final else None,
            'runtimeArchiveRestoreLog': restore,
            'runtimeArchiveRestored': restore is not None,
        })
    out[str(run)] = {'headSha': response['headSha'], 'jobs': rows}
    print(run, len(rows), 'seconds', sum(r['stepSeconds'] for r in rows))
pathlib.Path('/tmp/u10-evidence/ci-summary.json').write_text(
    json.dumps(out, indent=2))
