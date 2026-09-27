"""Recompute U10 derived values without builds or the original raw files."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent
runs = json.loads((root / 'runs.json.txt').read_text())
for name, run in runs.items():
    t = run['time']
    ratio = (t['userSeconds'] + t['systemSeconds']) / t['wallSeconds']
    print(name, 'runner_s', run['metadata']['durationMilliseconds'] / 1000,
          'CPU/wall', round(ratio, 2))
means = [sum(runs[f'{rev}-warm{i}']['metadata']['durationMilliseconds']
             for i in (1, 2)) / 2000 for rev in ('32ece7f4', 'aff3ade3')]
print('derived warm mean rise percent', 100 * (means[1] / means[0] - 1))
controls = json.loads((root / 'control-metrics.json.txt').read_text())
sources = controls['sourceMultiset']
for name, data in controls['runs'].items():
    print(name, 'C files', sum(s['count'] for s in sources),
          'C bytes', sum(s['count'] * s['bytes'] for s in sources),
          'phase_s', {k: sum(v) / 1000
                      for k, v in data['milliseconds'].items()})
metrics = json.loads((root / 'new-metrics.json.txt').read_text())
for name, data in metrics.items():
    paths = data['nativeMillisecondsByPath']
    heavy = [p for p in paths if p.endswith((
        '/coerced-values-end-detached.js',
        '/coerced-values-end-detached-prototype.js',
        '/coerced-values-start-detached.js'))]
    assert len(heavy) == 3 and all(len(paths[p]) == 4 for p in heavy)
    numerator = sum(sum(paths[p]) for p in heavy) / 1000
    denominator = sum(sum(v) for v in paths.values()) / 1000
    print(name, 'heavy_s', numerator, 'native_s', denominator,
          'derived share percent', 100 * numerator / denominator,
          'heavy path_s', {p: sum(paths[p]) / 1000 for p in heavy},
          'compile/link_s', sum(data['otherMilliseconds']['compile/link'])
          / 1000)
ci = json.loads((root / 'ci-summary.json.txt').read_text())
corpus = json.loads((root / 'corpus.json.txt').read_text())
rates, totals = [], []
points = {'35456667007': '32ece7f4', '35463308291': 'e99620d5',
          '35493049199': 'aff3ade3'}
for run, rev in points.items():
    assert ci[run]['headSha'].startswith(rev)
    total = sum(row['stepSeconds'] for row in ci[run]['jobs'])
    rate = total / corpus[rev]['all']['paths']
    totals.append(total)
    rates.append(rate)
    print(run, 'step_s', total, 's/path', rate)
print('derived CI rate rise percent', 100 * (rates[-1] / rates[0] - 1))
print('derived CI sum rise percent', 100 * (totals[-1] / totals[0] - 1))
a, b = (corpus[r]['all']['variants'] for r in ('32ece7f4', 'aff3ade3'))
print('derived variant rise percent', 100 * (b / a - 1))
