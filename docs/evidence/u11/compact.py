"""Preserve raw compact measurements and recompute their CPU attribution."""
import json
import re
import sys
from pathlib import Path

raw = Path(sys.argv[1])
output = Path(sys.argv[2])
names = ('profile3', 'shard2', 'nosan1', 'baseline1', 'baseline2')
runs = {}
for name in names:
    if not (raw / f'{name}.json').exists():
        continue
    result = json.loads((raw / f'{name}.json').read_text())
    metrics = json.loads((raw / f'{name}.json.metrics').read_text())
    profiles = []
    assert metrics, f'{name}: no native executions captured'
    for metric in metrics:
        expected_profiles = 0 if name.startswith('baseline') else 1
        assert len(metric['profile']) == expected_profiles, (
            f'{name}: expected {expected_profiles} profile per execution; '
            'missing instrumentation or multiple contexts are unsupported')
        for line in metric['profile']:
            fields = dict(re.findall(r'(\w+)=([0-9.]+)', line))
            profiles.append({key: float(value) if '.' in value else int(value)
                             for key, value in fields.items()})
    totals = {key: sum(p.get(key, 0) for p in profiles)
              for key in ('cpu', 'gc', 'lookup', 'hit', 'miss', 'collections',
                          'lookups', 'comparisons', 'large_comparisons',
                          'allocations')}
    if profiles:
        totals['gcPercent'] = 100 * totals['gc'] / totals['cpu']
        totals['lookupPercent'] = 100 * totals['lookup'] / totals['cpu']
    runs[name] = {
        'start': (raw / f'{name}.start').read_text().strip(),
        'commandTime': (raw / f'{name}.time').read_text().strip(),
        'result': result,
        'native': metrics,
        'derivedTotals': totals if profiles else None,
    }
output.write_text(json.dumps(runs, indent=2) + '\n')
for name, run in runs.items():
    print(name, json.dumps(run['derivedTotals']))
