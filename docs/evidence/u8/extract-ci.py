"""Extract measured case durations, derived file sums and workflow steps.

Usage: python3 extract-ci.py RUN JOBS_JSON LOGS_ZIP NAMES_JSON
Redirect stdout to compact.json.txt.
NAMES_JSON comes from test-names.mjs.txt at the run's headSha.
"""

import json
import re
import sys
import zipfile


def category(path):
    if path == 'packages/parser-babel/tests/statements.test.ts':
        return 'timing-verdict'
    if '.property.test.ts' in path:
        if (path.startswith('packages/') or 'unicode-tables.' in path or
                path.rsplit('/', 1)[-1] in {
                    'm5-regexp-matcher.property.test.ts',
                    'm5-regexp-pattern-extensions.property.test.ts',
                    'm5-regexp-pattern.property.test.ts',
                    'm5-regexp-unicode-property-escapes.property.test.ts',
                }):
            return 'timing-verdict'
        return 'macos-only'
    if path.startswith(('packages/compiler/tests/',
                        'packages/backend-c/tests/',
                        'packages/parser-babel/tests/')):
        return 'independent-linux'
    if path in {
        'packages/cli/tests/index.test.ts',
        'packages/testkit/tests/index.test.ts',
        'packages/runtime-c/tests/index.test.ts',
        'packages/runtime-c/tests/symbols.test.ts',
        'packages/runtime-c/tests/intrinsic-graph.test.ts',
        'packages/runtime-c/tests/builtin-code-registry.test.ts',
        'packages/unicode/tests/tables.test.ts',
        'tests/harness-fragments.test.ts',
        'tests/regexp-literal-aot.test.ts',
        'tests/regexp-matcher.test.ts',
        'tests/shard.test.ts',
        'tests/structured-data.test.ts',
        'tests/test262-inventory.test.ts',
        'tests/unicode-property-escapes.test.ts',
        'tests/unicode-tables.test.ts',
        'tests/evidence-lanes.test.ts',
        'tests/m5b-graph.test.ts',
        'tests/m5c-graph.test.ts',
    }:
        return 'independent-linux'
    if path in {
        'packages/runtime-c/tests/typed-array-clone.test.ts',
        'packages/runtime-c/tests/date-fp-contract.test.ts',
        'packages/toolchain-zig/tests/index.test.ts',
        'packages/toolchain-zig/tests/sanitizer-activity.test.ts',
        'tests/harness-native.test.ts',
        'tests/harness-resource.test.ts',
        'tests/native-runtime-archive-cache.test.ts',
        'tests/test262-fragments.test.ts',
        'tests/native-io/clock-wakeup.test.ts',
        'tests/host-cc-sanitizer.test.ts',
    } or (path.startswith('tests/runtime-') and
          path != 'tests/runtime-archive-cache.test.ts'):
        return 'macos-only'
    return 'unclear'


run, response_path, archive_path, patterns_path = sys.argv[1:]
with open(response_path) as source:
    response = json.load(source)
with open(patterns_path) as source:
    registrations = json.load(source)


def index_names(field):
    index = {}
    for entry in registrations:
        for pattern in entry[field]:
            if '.*' not in pattern:
                title = re.sub(r'\\(.)', r'\1', pattern)
                index.setdefault(title, set()).add(entry['path'])
    return index


exact_names = index_names('patterns')
literal_names = index_names('literals')
patterns = [(entry['path'], re.compile('^' + pattern + '$'))
            for entry in registrations for pattern in entry['patterns']
            if '.*' in pattern]
output = {'sourceRun': run, 'headSha': response['headSha'], 'jobs': []}
with zipfile.ZipFile(archive_path) as archive:
    for job in response['jobs']:
        name = job['name']
        if not ('macos' in name or 'macOS' in name or
                name == 'test (ubuntu-latest, node)'):
            continue
        matches = [entry for entry in archive.namelist()
                   if re.fullmatch(r'\d+_' + re.escape(name.replace('/', '_'))
                                   + r'\.txt', entry)]
        if len(matches) != 1:
            raise ValueError(f'Expected one log for {name}: {matches}')
        rows = [re.sub(r'\x1b\[[0-9;]*m', '', line)
                for line in archive.read(matches[0]).decode().splitlines()]
        steps = [{
            'name': step['name'],
            'start': step['startedAt'], 'end': step['completedAt'],
        } for step in job['steps'] if step['conclusion'] != 'skipped']
        item = {
            'name': name, 'id': job['databaseId'],
            'start': job['startedAt'],
            'end': job['completedAt'],
            'steps': steps,
        }
        if name.endswith(', node)'):
            files = {entry['path']: {
                'path': entry['path'], 'category': category(entry['path']),
                'cases': [],
            } for entry in registrations}
            unmatched = []
            # Runner failure details repeat a failed case near the end.
            # Only parse the main ordered stream before the final summary.
            started = False
            for row in rows:
                if "[test:node] $ node --test" in row:
                    started = True
                    continue
                if not started:
                    continue
                if re.search(r'ℹ tests \d+', row):
                    break
                case = re.search(r'[✔✖] (.+) \(([\d.]+)ms\)', row)
                if case is None:
                    continue
                title, duration = case.groups()
                paths = sorted(exact_names.get(title) or
                               literal_names.get(title) or
                               {path for path, pattern in patterns
                                if pattern.fullmatch(title)})
                if len(paths) == 1:
                    files[paths[0]]['cases'].append(float(duration))
                else:
                    unmatched.append(float(duration))
            item['files'] = list(files.values())
            item['unmatchedCases'] = unmatched
        output['jobs'].append(item)
print(json.dumps(output, indent=2))
