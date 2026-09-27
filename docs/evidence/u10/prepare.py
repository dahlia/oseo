"""Prepare reference wrappers in a disposable historical checkout only."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
selection = Path(sys.argv[2]).resolve()
mode = sys.argv[3]  # plain, control, or new
assert mode in ('plain', 'control', 'new')
evidence = Path(__file__).resolve().parent
runner_path = root / 'tools/u10-runner.ts'
bench_path = root / 'tools/u10-bench.ts'
assert not runner_path.exists() and not bench_path.exists()
runner = (root / 'tools/test262.ts').read_text()
exports = ('suiteRoot,readHarnesses,canonicalizeManifestTarget,'
           'readSerializedManifest,fragmentExecutor')
bench = (evidence / 'bench.ts.txt').read_text()
bench = bench.replace('/tmp/u10-evidence/paths.json', str(selection))
if mode != 'plain':
    template = 'instrument.ts.txt' if mode == 'control' else \
        'new-instrument.ts.txt'
    marker = 'const runnerHost = createNodeHost();'
    assert runner.count(marker) == 1
    runner = runner.replace(marker, (evidence / template).read_text())
    if mode == 'control':
        exports += ',metrics'
        marker = '  fragmentExecutor,\n'
        assert bench.count(marker) == 1
        bench = bench.replace(marker, marker + '  metrics,\n')
        bench = bench.replace('JSON.stringify(run));',
                              'JSON.stringify({...run,metrics}));')
runner_path.write_text(runner + '\nexport {' + exports + '};\n')
bench_path.write_text(bench)
