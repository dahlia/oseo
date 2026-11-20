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

"""Recompute U7 costs from the compact preserved timestamp inputs."""

import json
import pathlib

root = pathlib.Path(__file__).parent
for run in [36243816479, 36261458909]:
    evidence = json.loads((root / f'ci-{run}.json.txt').read_text())
    print('RUN', run, evidence['headSha'])
    totals = {}
    for job in evidence['jobs']:
        name = job['name']
        host = ('macOS' if 'macos' in name or 'macOS' in name
                else 'Linux')
        for step in job['steps']:
            # GCC verification has its own workflow name, not this prefix.
            if not step['name'].startswith('Run mise run test:'):
                continue
            task = step['name'].split('mise run ')[1].split()[0]
            key = (host, task)
            totals[key] = totals.get(key, 0) + step['seconds']
        builds = job['laterBuilds']
        if builds:
            print('REBUILD', name, len(builds),
                  f"{sum(row['seconds'] for row in builds):.2f}")
        for task, seconds in job['toolingTestSeconds'].items():
            print('TOOLING', task, f'{seconds:.3f}')
    for key, seconds in sorted(totals.items()):
        print('STEP', *key, seconds)
