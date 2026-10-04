#!/bin/bash
set -euo pipefail
umask 077

runner_root=${OSEO_RUNNER_ROOT:?Set OSEO_RUNNER_ROOT}
runner_user=${OSEO_RUNNER_USER:?Set OSEO_RUNNER_USER}
runner_label=oseo-mac-1
service_label=org.oseo.runner.$runner_label
plist=/Library/LaunchDaemons/$service_label.plist
script_dir=$(cd "$(dirname "$0")" && pwd)

[[ $runner_root == /* && $runner_root != / ]] || {
  echo 'Runner root must be an absolute non-root path' >&2
  exit 2
}
[[ $runner_user =~ ^[a-z_][a-z_0-9-]*$ ]] || {
  echo 'Runner user must be a local account name' >&2
  exit 2
}
if [[ ${1:-} == --dry-run ]]; then
  echo "Would install $plist for $runner_user at $runner_root"
  exit 0
fi
[[ $(uname -s) == Darwin && $EUID -eq 0 ]] || {
  echo 'Run as root on macOS' >&2
  exit 2
}
[[ -x $runner_root/bin/Runner.Listener && -f $runner_root/.runner ]] || {
  echo 'Register the pinned persistent runner first' >&2
  exit 2
}
[[ $(id -Gn "$runner_user") != *admin* ]] || {
  echo 'Runner account must not be an administrator' >&2
  exit 2
}
[[ $(stat -f %Su "$runner_root") == "$runner_user" ]] || {
  echo 'Runner account must own the runner root' >&2
  exit 2
}
runner_home=$(
  dscl . -read "/Users/$runner_user" NFSHomeDirectory | awk '{print $2}'
)
[[ $runner_home == /* && -d $runner_home ]] || {
  echo 'Runner account needs a home directory' >&2
  exit 2
}
service_script=/usr/local/libexec/oseo-runner
install -d -m 755 -o root -g wheel "$service_script"
install -d -m 700 -o "$runner_user" -g staff "$runner_root/oseo-temp"
for file in job-started.sh job-completed.sh cleanup.sh; do
  install -m 555 -o root -g wheel "$script_dir/$file" \
    "$service_script/$file"
done
RUNNER_PLIST=$plist RUNNER_ROOT=$runner_root RUNNER_USER=$runner_user \
RUNNER_HOME=$runner_home \
RUNNER_SERVICE_LABEL=$service_label \
RUNNER_SERVICE_SCRIPT=$service_script /usr/bin/python3 - <<'PY'
import os
import plistlib

root = os.environ['RUNNER_ROOT']
hooks = os.environ['RUNNER_SERVICE_SCRIPT']
home = os.environ['RUNNER_HOME']
path = ':'.join((home + '/.local/bin', '/opt/homebrew/bin',
                 '/usr/local/bin', '/usr/bin', '/bin'))
data = {
    'Label': os.environ['RUNNER_SERVICE_LABEL'],
    'ProgramArguments': [os.path.join(root, 'bin/Runner.Listener'), 'run'],
    'WorkingDirectory': root,
    'UserName': os.environ['RUNNER_USER'],
    'RunAtLoad': True,
    'KeepAlive': True,
    'ThrottleInterval': 60,
    'StandardOutPath': '/dev/null',
    'StandardErrorPath': '/dev/null',
    'EnvironmentVariables': {
        'HOME': home,
        'PATH': path,
        'OSEO_RUNNER_ROOT': root,
        'TMPDIR': os.path.join(root, 'oseo-temp') + '/',
        'ZIG_GLOBAL_CACHE_DIR': os.path.join(home, '.cache/zig'),
        'ACTIONS_RUNNER_HOOK_JOB_STARTED':
            os.path.join(hooks, 'job-started.sh'),
        'ACTIONS_RUNNER_HOOK_JOB_COMPLETED':
            os.path.join(hooks, 'job-completed.sh'),
    },
}
with open(os.environ['RUNNER_PLIST'], 'wb') as output:
    plistlib.dump(data, output)
PY
chown root:wheel "$plist"
chmod 600 "$plist"
launchctl bootout system "$plist" 2>/dev/null || true
launchctl bootstrap system "$plist"
