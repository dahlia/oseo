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

"""Original U10 corpus extraction algorithm, wrapped for preservation."""
import collections
import io
import json
import pathlib
import subprocess
import tarfile
import yaml

out, base = {}, None
for rev in ['32ece7f4', 'a41aeb0b', '9ecf1642', '7df433ae', '61a5214d',
            'e99620d5', '9e71f689', '1a879b2e', 'aff3ade3']:
    data = subprocess.check_output(
        ['git', 'archive', rev, 'tests/test262/results'])
    records = {}
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        for file in archive:
            if not file.isfile():
                continue
            parsed = yaml.load(archive.extractfile(file).read(),
                               Loader=yaml.CSafeLoader)
            for record in parsed['results']:
                records[record['case']['path']] = record
    if base is None:
        base = records
    old = {p: r for p, r in records.items() if p in base}
    new = {p: r for p, r in records.items() if p not in base}

    def counts(rs):
        return {
            'paths': len(rs),
            'classes': dict(collections.Counter(
                r['classification'] for r in rs.values())),
            'variants': sum(len(r.get('execution', {}).get('variants', []))
                            for r in rs.values()),
            'executedPaths': sum('execution' in r for r in rs.values()),
        }

    transitions = collections.Counter(
        (base[p]['classification'], r['classification'])
        for p, r in old.items()
        if base[p]['classification'] != r['classification'])
    out[rev] = {
        'all': counts(records), 'old': counts(old), 'new': counts(new),
        'transitions': {str(k): v for k, v in transitions.items()},
    }
    print(rev, out[rev], flush=True)
pathlib.Path('/tmp/u10-evidence/corpus.json').write_text(
    json.dumps(out, indent=2))
