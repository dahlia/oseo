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

"""Create temporary profiling wrappers; never edit runtime sources on disk."""
from pathlib import Path

root = Path.cwd()
evidence = root / 'docs/evidence/u11'
runner = (root / 'tools/test262.ts').read_text()
marker = 'const runnerHost = createNodeHost();'
assert runner.count(marker) == 1
runner = runner.replace(marker, (evidence / 'instrument.ts.txt').read_text())
cli_anchor = 'version: "0.1.0",\n      }),'
assert runner.count(cli_anchor) == 1
runner = runner.replace(cli_anchor,
                        'version: "0.1.0",\n      }, runnerHost),')
runner += ('\nexport { suiteRoot, readHarnesses, nativeExecutor, '
           'readSerializedManifest, canonicalizeManifestTarget };\n')
(root / 'tools/u11-runner.ts').write_text(runner)
(root / 'tools/u11-bench.ts').write_text(
    (evidence / 'bench.ts.txt').read_text())
