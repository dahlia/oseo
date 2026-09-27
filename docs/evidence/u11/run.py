"""Run serial Phase A controls with the fixed lane and gate flags."""
import os
import subprocess
import sys
from pathlib import Path

assert 'OSEO_GC_EVERY_SAFEPOINT' not in os.environ
assert os.environ.get('OSEO_NATIVE_TOOLCHAIN') != 'host-cc'
raw = Path(sys.argv[1]).resolve()
raw.mkdir(parents=True, exist_ok=True)
subprocess.run(['python3', 'docs/evidence/u11/prepare.py'], check=True)
for trial, mode, sample, cache in (
    ('profile3', 'profile', 'case', 'profile'),
    ('shard2', 'profile', 'shard', 'profile'),
    ('nosan1', 'nosan', 'case', 'nosan'),
    ('baseline1', 'baseline', 'case', 'baseline'),
    ('baseline2', 'baseline', 'case', 'baseline'),
):
    env = dict(os.environ,
               ZIG_GLOBAL_CACHE_DIR=
               '/data/zig-cache/m5ci-native-case-runtime-cost',
               XDG_CACHE_HOME=str(raw / ('cache-' + cache)),
               U11_MODE=mode, U11_SAMPLE=sample,
               U11_RESULT=str(raw / (trial + '.json')))
    with (raw / (trial + '.start')).open('w') as start:
        subprocess.run(['date', '-Is'], stdout=start, check=True)
    with (raw / (trial + '.log')).open('w') as log:
        subprocess.run([
            '/usr/bin/time', '-f', 'wall=%e user=%U system=%S',
            '-o', str(raw / (trial + '.time')), 'mise', 'exec', '--',
            'node', 'tools/u11-bench.ts',
        ], env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
