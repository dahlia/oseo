import datetime
import json
from pathlib import Path
runs = ['36243816479', '36261458909', '36312192623']
data = [json.loads(Path('docs/evidence/u8/ci-'+run+'.json.txt').read_text())
        for run in runs]
def seconds(start, end):
    def parse(value):
        return datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    return (parse(end) - parse(start)).total_seconds()


for run in data:
    for job in run['jobs']:
        job['measuredJobSeconds'] = seconds(job['start'], job['end'])
        for step in job['steps']:
            step['measuredSeconds'] = seconds(step['start'], step['end'])
        for record in job.get('files', []):
            record['derivedCaseSeconds'] = sum(record['cases']) / 1000
        if 'files' in job:
            job['derivedCategoryCaseSeconds'] = {
                group: sum(record['derivedCaseSeconds']
                           for record in job['files']
                           if record['category'] == group)
                for group in sorted({record['category']
                                     for record in job['files']})
            }
            job['derivedUnmatchedSeconds'] = sum(job['unmatchedCases']) / 1000

jobs = [next(j for j in x['jobs'] if j['name']=='test (macos-latest, node)')
        for x in data]
files = [{f['path']: f for f in j['files']} for j in jobs]
rows = ['U8 per-file Node case costs', '============================', '',
        'Derived seconds from measured case `ms` values in the named',
        'macOS Node job logs; see [*README.md*](./README.md) for limits.',
        'The word absent means the file did not exist at that run\'s commit.',
        'A zero means no uniquely attributable case duration,',
        'not zero file cost.',
        'Every source file is listed; categories apply to complete files.', '',
        '| Source file | Audit category | 36243816479 s | '
        '36261458909 s | 36312192623 s |',
        '| --- | --- | ---: | ---: | ---: |']
for path in sorted(set().union(*(set(x) for x in files))):
    category = next(x[path]['category'] for x in reversed(files) if path in x)
    values = [f"{x[path]['derivedCaseSeconds']:.3f}" if path in x else 'absent'
              for x in files]
    rows.append('| *'+path+'* | '+category+' | '+' | '.join(values)+' |')
rows += ['', 'Category totals and ambiguous cases are in the main audit.',
         'The JSON inputs retain each measured case duration and its '
         'source file.',
         '']
Path('docs/evidence/u8/file-costs.md').write_text('\n'.join(rows))
rows = ['U8 macOS workflow step costs', '============================', '',
        'Measured seconds from GitHub job/step timestamps in each run.',
        'These are historical costs; U8 changed or triggered no workflow.',
        'Skipped conditional steps are omitted. Each job table includes its',
        'measured whole-job duration, including gaps between listed steps.', '']
for x in data:
    rows += ['Run '+x['sourceRun']+' at `'+x['headSha'][:8]+'`',
             '-' * 40, '', '| Source job | Step | Measured s |',
             '| --- | --- | ---: |']
    for j in sorted(x['jobs'], key=lambda j:j['name']):
        if 'ubuntu' in j['name']:
            continue
        rows.append(
            f"| {j['name']} | Whole job ({j['id']}) | "
            f"{j['measuredJobSeconds']:.0f} |")
        for t in j['steps']:
            rows.append(
                f"| {j['name']} | `{t['name']}` | {t['measuredSeconds']:.0f} |")
    rows.append('')
Path('docs/evidence/u8/job-steps.md').write_text('\n'.join(rows))

# Check every numeric row in the two U8 baseline cost tables.
baseline = Path('docs/gate-cost-baseline.md').read_text()
components = {
    'Node whole job': [], 'Node test step, including repeated build': [],
    'Deno whole job': [], 'Deno test step': [],
    'Extended package step, including repeated build': [],
}
for run in data:
    node = next(j for j in run['jobs']
                if j['name'] == 'test (macos-latest, node)')
    deno = next(j for j in run['jobs']
                if j['name'] == 'test (macos-latest, deno)')
    package = next(j for j in run['jobs']
                   if j['name'] == 'native support (macos-aarch64, 1/12)')
    components['Node whole job'].append(node['measuredJobSeconds'])
    components['Deno whole job'].append(deno['measuredJobSeconds'])
    for label, job, task in [
        ('Node test step, including repeated build', node, 'test:node'),
        ('Deno test step', deno, 'test:deno'),
        ('Extended package step, including repeated build', package,
         'test:property:extended:package'),
    ]:
        step = next(t for t in job['steps'] if task in t['name'])
        components[label].append(step['measuredSeconds'])
category_labels = {
    'Provably independent, matching Linux Node coverage': 'independent-linux',
    'Native/host compiler evidence retained': 'macos-only',
    'Semantically independent timing-verdict files retained': 'timing-verdict',
    'Unclear mixed/host/tooling files retained': 'unclear',
}
expected = {label: [f'{value:.0f}' for value in values]
            for label, values in components.items()}
expected.update({label: [f"{j['derivedCategoryCaseSeconds'][group]:.3f}"
                         for j in jobs]
                 for label, group in category_labels.items()})
expected['Ambiguous source-file attribution'] = [
    f"{j['derivedUnmatchedSeconds']:.3f}" for j in jobs]
for label, values in expected.items():
    row = next(line for line in baseline.splitlines()
               if line.startswith('|') and line.split('|')[1].strip() == label)
    actual = [cell.strip() for cell in row.split('|')[2:-1]]
    if actual != values:
        raise ValueError(f'{label}: baseline {actual} != evidence {values}')
print('All U8 baseline cost rows reproduced exactly.')
