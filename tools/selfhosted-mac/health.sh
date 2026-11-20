#!/bin/bash
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

set -euo pipefail
root=${OSEO_RUNNER_ROOT:?Set OSEO_RUNNER_ROOT}
label=${OSEO_RUNNER_LABEL:-oseo-mac-1}
script_dir=$(cd "$(dirname "$0")" && pwd)
if [[ $label == *$'\n'* ]] ||
  ! grep -Fxq -- "$label" "$script_dir/lane-labels.txt"; then
  echo 'Runner label must be listed in lane-labels.txt' >&2
  exit 2
fi
[[ $(uname -s) == Darwin ]] || { echo 'macOS required' >&2; exit 2; }
[[ $EUID -eq 0 ]] || { echo 'Run health check with sudo' >&2; exit 2; }
echo "Host OS: $(sw_vers -productVersion)"
echo "Architecture: $(uname -m)"
echo "Runner listener: $root/bin/Runner.Listener"
launchctl print "system/org.oseo.runner.$label"
df -h "$root"
if [[ -d $root/oseo-temp && ! -L $root/oseo-temp ]]; then
  du -sh "$root/oseo-temp"
fi
if [[ -d $root/_diag ]]; then
  find "$root/_diag" -type f -mtime -1 -print
fi
