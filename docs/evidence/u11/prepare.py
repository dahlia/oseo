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
