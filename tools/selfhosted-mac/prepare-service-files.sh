#!/bin/bash
set -euo pipefail
umask 077

root=${1:?Set runner root}
home=${2:?Set runner home}
runner_user=${3:?Set runner user}
runner_group=${4:?Set runner group}
prefix=${5:?Set system prefix}
system_user=${6:?Set system user}
system_group=${7:?Set system group}
source_dir=${8:?Set source directory}

[[ $root == /* && $home == /* && $prefix == /* &&
  $root != / && $home != / && $prefix != / &&
  $home != /Users ]] || {
  echo 'Service paths must be absolute non-system roots' >&2
  exit 2
}
[[ -f $root/.credentials && -f $root/.credentials_rsaparams ]] || {
  echo 'Register the runner before installing its service' >&2
  exit 2
}
[[ ! -L $root && ! -L $home && ! -L $root/oseo-temp ]] || {
  echo 'Runner directories must not be links' >&2
  exit 2
}

hooks=$prefix/libexec/oseo-runner
# Install each component separately. Under umask 077, install -d leaves
# implicitly created parents at mode 700; probe run 37181275283 logged
# missing hooks before the operator found the inaccessible parent.
for directory in "$prefix" "$prefix/libexec" "$hooks"; do
  [[ ! -L $directory ]] || {
    echo "Hook directory must not be a link: $directory" >&2
    exit 2
  }
  install -d -m 755 -o "$system_user" -g "$system_group" \
    "$directory"
done

chmod 700 "$home" "$root"
shopt -s nullglob
for credential in "$root"/.credentials*; do
  [[ -f $credential && ! -L $credential ]] || {
    echo "Credential must be a regular file: $credential" >&2
    exit 2
  }
  chmod 600 "$credential"
done
install -d -m 700 -o "$runner_user" -g "$runner_group" \
  "$root/oseo-temp"
for name in job-started.sh job-completed.sh cleanup.sh; do
  install -m 555 -o "$system_user" -g "$system_group" \
    "$source_dir/$name" "$hooks/$name"
done
