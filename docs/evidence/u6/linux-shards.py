"""Derive Linux file weights and replay the fixed four-worker batch model.

Usage: python3 docs/evidence/u6/linux-shards.py LOG_DIRECTORY
Read only downloaded logs and source text; never execute property tests.
The TSV retains the pre-refresh table, including absent entries as '-'.
"""

from decimal import Decimal, ROUND_CEILING
from pathlib import Path
import json
import re
import statistics
import sys


ROOT = Path('docs/evidence/u6')
SNAPSHOT = ROOT / 'linux-shard-weights.tsv'
RUNS = ['d4d81be9', '98460f7c', '6aab0fc8']
EXCLUDED = {
    'tests/property/m5-object-own-keys.property.test.ts',
    'tests/property/m5-reflect-namespace.property.test.ts',
    'tests/property/m5-array-constructor.property.test.ts',
}
# Added to main after these runs, so the logs never observed them; their
# table weights are retained unchanged. The two module files carry one-run
# case sums from candidate CI 40869736577; with-var loop heads use
# candidate CI 41059687055. See the U6 README.
RETAINED = {
    'tests/property/m5-host-script-bindings.property.test.ts',
    'tests/property/m5-module-namespace-uninitialized.property.test.ts',
    'tests/property/m5-module-prelude-script.property.test.ts',
    'tests/property/m5-proper-tail-calls.property.test.ts',
    'tests/property/m5-with-var-loop-head.property.test.ts',
}
# Logged files later split by test registration. Each logged title is
# rebucketed to the current source that defines it.
SPLITS = {
    'tests/property/m5-compound-assignment.property.test.ts': [
        'tests/property/m5-compound-assignment.property.test.ts',
        'tests/property/m5-compound-member-fixed.property.test.ts',
        'tests/property/m5-computed-member-fixed.property.test.ts',
    ],
}


def current_table():
    """Read the Linux literal without importing or executing TypeScript."""
    source = Path('tools/native-shard-costs.ts').read_text()
    linux = source.split('"linux-x86_64-gnu": {', 1)[1]
    linux = linux.split('"macos-aarch64": {', 1)[0]
    return {path: int(cost) for path, cost in re.findall(
        r'"([^"]+\.ts)": (\d+)', linux)}


def completion(files, costs):
    """Replay first-free worker slots in the selected file order."""
    measured = sorted(costs.values())
    fallback = measured[len(measured) // 2]
    slots = [0] * 4
    for path in files:
        worker = slots.index(min(slots))
        slots[worker] += costs.get(path, fallback)
    return max(slots)


def partition(files, costs, total):
    """Match selectNativeTestShard's Linux batches after CI exclusions."""
    measured = sorted(costs.values())
    fallback = measured[len(measured) // 2]
    ordered = sorted(files, key=lambda path: (-costs.get(path, fallback), path))
    shards = [[] for _ in range(min(total, (len(files) + 3) // 4))]
    for offset in range(0, len(ordered), 4):
        loads = [completion(shard, costs) for shard in shards]
        shards[loads.index(min(loads))].extend(ordered[offset:offset + 4])
    return shards + [[] for _ in range(total - len(shards))]


def extract(directory, sources):
    """Map complete spec-reporter titles to one selected source file."""
    observations = {}
    memberships = {}
    receipts = {}
    jobs = (directory / 'jobs.txt').read_text().splitlines()
    for run, job, index, outcome, sha in (line.split() for line in jobs):
        assert sha in RUNS and outcome == 'success'
        rows = re.sub(r'\x1b\[[0-9;]*m', '', (
            directory / f'{sha}-{index}.log'
        ).read_text(encoding='utf-8-sig')).splitlines()
        markers = [i for i, row in enumerate(rows) if 'native-shard {' in row]
        assert len(markers) == 1
        start = markers[0]
        metadata = json.loads(rows[start].split('native-shard ', 1)[1])
        assert metadata['workers'] == 4
        files = metadata['files']
        assert len(files) == len(set(files))
        assert not EXCLUDED.intersection(files)
        current = [part for path in files for part in SPLITS.get(path, [path])]
        cases = {path: [] for path in current}
        for row in rows[start + 1:]:
            case = re.search(r'Z ([✔✖]) (.+) \(([\d.]+)ms\)$', row)
            if case is None:
                continue
            outcome, title, duration = case.groups()
            assert outcome == '✔', (sha, index, title)
            matches = [path for path in current if title in sources[path]]
            assert len(matches) == 1, (title, matches)
            cases[matches[0]].append(Decimal(duration))
        assert all(cases.values()), (sha, index, 'missing file cases')
        counts = dict(re.findall(
            r'ℹ (tests|pass|fail|cancelled|skipped|todo) (\d+)',
            '\n'.join(rows[start:]),
        ))
        count = sum(map(len, cases.values()))
        assert int(counts['tests']) == int(counts['pass']) == count
        assert all(counts[key] == '0' for key in (
            'fail', 'cancelled', 'skipped', 'todo'))
        sums = {path: sum(values) for path, values in cases.items()}
        measured = observations.setdefault(sha, {})
        assert not measured.keys() & sums.keys()
        measured.update(sums)
        memberships.setdefault(sha, {})[int(index)] = files
        receipts.setdefault(sha, {})[int(index)] = (run, job, count)
    expected = sources.keys() - EXCLUDED - RETAINED
    for sha in RUNS:
        assert observations[sha].keys() == expected
        assert set(memberships[sha]) == set(range(1, 8))
    return observations, memberships, receipts


def main():
    """Reproduce the per-file evidence and print old/new modeled loads."""
    sources = {str(path): path.read_text() for path in sorted(
        Path('tests/property').glob('*.property.test.ts'))}
    observed, memberships, receipts = extract(Path(sys.argv[1]), sources)
    table = current_table()
    if SNAPSHOT.exists():
        old = {fields[0]: int(fields[1]) for fields in (
            row.split('\t') for row in SNAPSHOT.read_text().splitlines()[1:]
        ) if fields[1] != '-'}
    else:
        old = table
    fresh = dict(old)
    for path in sources.keys() - EXCLUDED - RETAINED:
        milliseconds = statistics.median(observed[sha][path] for sha in RUNS)
        fresh[path] = int((milliseconds / 1000).to_integral_value(
            rounding=ROUND_CEILING))
    header = ['file', 'oldSeconds', *[sha + 'CaseMs' for sha in RUNS],
              'medianSecondsCeil']
    rows = ['\t'.join(header)]
    for path in sources:
        rows.append('\t'.join([
            path, str(old.get(path, '-')),
            *[str(observed[sha].get(path, '-')) for sha in RUNS],
            str(fresh[path]),
        ]))
    snapshot = '\n'.join(rows) + '\n'
    if SNAPSHOT.exists():
        assert SNAPSHOT.read_text() == snapshot, 'weight evidence differs'
    else:
        SNAPSHOT.write_text(snapshot)
    assert table == fresh, 'TypeScript table differs from derivation'
    print('Derived seconds; concurrent case sums, no fixed job overhead.')
    print('Statistic: ceil(median(per-run sum(case_ms)) / 1000).')
    print('Measured files:', len(sources) - len(EXCLUDED) - len(RETAINED))
    print('No file-shard observation; retained:',
          ', '.join(sorted(EXCLUDED | RETAINED)))
    print('Rebucketed:', ', '.join(
        f'{path} -> {len(parts)} files' for path, parts in SPLITS.items()))
    for sha in RUNS:
        print(sha, 'shard:run/job/cases', ' '.join(
            f'{i}:{run}/{job}/{count}'
            for i, (run, job, count) in sorted(receipts[sha].items())))
        logged = sources.keys() - EXCLUDED - RETAINED - {
            part for parts in SPLITS.values() for part in parts[1:]}
        # These runs scheduled with the pre-refresh table, before RETAINED.
        logged_costs = {path: cost for path, cost in old.items()
                        if path not in RETAINED}
        assert [memberships[sha][i] for i in range(1, 8)] == partition(
            sorted(logged), logged_costs, 7)
    files = sorted(sources.keys() - EXCLUDED)
    for label, costs in [('old', old), ('refreshed', fresh)]:
        print(label, 'entries/fallback:', len(costs),
              sorted(costs.values())[len(costs) // 2])
        for total in [7, 8, 9]:
            shards = partition(files, costs, total)
            loads = [completion(shard, costs) for shard in shards]
            scored = [completion(shard, fresh) for shard in shards]
            mean = statistics.mean(loads)
            print(label, total, 'loads:', ','.join(map(str, loads)),
                  'mean:', f'{mean:.3f}', 'max/mean:',
                  f'{max(loads) / mean:.6f}',
                  'scored with refreshed:', ','.join(map(str, scored)))


if __name__ == '__main__':
    main()
