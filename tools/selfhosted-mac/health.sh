#!/bin/bash
set -euo pipefail
root=${OSEO_RUNNER_ROOT:?Set OSEO_RUNNER_ROOT}
[[ $(uname -s) == Darwin ]] || { echo 'macOS required' >&2; exit 2; }
[[ $EUID -eq 0 ]] || { echo 'Run health check with sudo' >&2; exit 2; }
echo "Host OS: $(sw_vers -productVersion)"
echo "Architecture: $(uname -m)"
echo "Runner listener: $root/bin/Runner.Listener"
launchctl print system/org.oseo.runner.oseo-mac-1
df -h "$root"
if [[ -d $root/oseo-temp && ! -L $root/oseo-temp ]]; then
  du -sh "$root/oseo-temp"
fi
if [[ -d $root/_diag ]]; then
  find "$root/_diag" -type f -mtime -1 -print
fi
