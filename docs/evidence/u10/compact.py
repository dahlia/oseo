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

"""Extract the reviewed U10 fields from the original raw evidence directory."""
import collections
import json
from pathlib import Path
import re
import sys

raw = Path(sys.argv[1])
dest = Path(sys.argv[2])
dest.mkdir(parents=True, exist_ok=True)
runs, controls, native = {}, {}, {}
for file in sorted(raw.glob('*.json')):
    name = file.stem
    pattern = (r'(?:[a-f0-9]{8}-(?:instrument-)?'
               r'(?:cold|prime|warm[12])|new-(?:prime|warm[12]))')
    if not re.fullmatch(pattern, name):
        continue
    data = json.loads(file.read_text())
    log = (raw / (name + '.log')).read_text()
    line = next(json.loads(l) for l in log.splitlines()
                if l.startswith('{"metadata"'))
    time = re.search(r'wall=([\d.]+) user=([\d.]+) system=([\d.]+) '
                     r'maxrss=(\d+)', log)
    runs[name] = {
        'rawJson': file.name, 'rawLog': name + '.log',
        'metadata': data['metadata'],
        'summary': {k: v for k, v in data['manifest']['summary'].items()
                    if isinstance(v, int)},
        'builds': line['builds'], 'variants': line['variants'],
        'time': dict(zip(['wallSeconds', 'userSeconds', 'systemSeconds',
                          'maxRssKiB'], map(float, time.groups()))),
    }
    if 'instrument-warm' in name:
        metrics = data['metrics']
        phases = collections.defaultdict(list)
        for process in metrics['processes']:
            phase = ('native' if '/fixture-' in process['command'] else
                     'compile/link' if process['args'] and
                     process['args'][0] == 'cc' else 'identity/other')
            phases[phase].append(process['milliseconds'])
        hashes = collections.Counter(
            (s['name'], s['bytes'], s['hash']) for s in metrics['sources'])
        controls[name] = {
            'rawJson': file.name,
            'processStatusCounts': dict(collections.Counter(
                p['status'] for p in metrics['processes'])),
            'milliseconds': dict(phases),
            'sources': [{'name': n, 'bytes': b, 'hash': h, 'count': c}
                        for (n, b, h), c in sorted(hashes.items())],
        }
for name in ['new-warm1', 'new-warm2']:
    metrics = json.loads((raw / (name + '.json.metrics')).read_text())
    processes = collections.defaultdict(list)
    other = collections.defaultdict(list)
    for process in metrics['processes']:
        assert process['status'] == 0
        if '/fixture-' in process['command']:
            processes[process['sourceId']].append(process['milliseconds'])
        else:
            phase = ('compile/link' if process['args'] and
                     process['args'][0] == 'cc' else 'identity/other')
            other[phase].append(process['milliseconds'])
    native[name] = {
        'rawMetrics': name + '.json.metrics', 'allProcessStatuses': 0,
        'nativeMillisecondsByPath': dict(sorted(processes.items())),
        'otherMilliseconds': dict(other),
    }
reference = next(iter(controls.values()))['sources']
for control in controls.values():
    assert control.pop('sources') == reference
controls = {'sourceMultiset': reference, 'runs': controls}
outputs = [('runs.json.txt', runs),
           ('control-metrics.json.txt', controls),
           ('new-metrics.json.txt', native)]
for name, data in outputs:
    (dest / name).write_text(json.dumps(data, indent=2) + '\n')
