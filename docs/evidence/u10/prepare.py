# Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
# Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
