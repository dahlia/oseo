#!/bin/bash
set -euo pipefail
umask 077

root=${OSEO_RUNNER_ROOT:?Set OSEO_RUNNER_ROOT}
phase=${1:?Set started or completed}
is_unlinked_directory() {
  local path=$1 logical physical
  [[ $path == /* && $path != */../* && $path != */.. &&
    -d $path ]] || return 1
  logical=$(cd "$path" 2>/dev/null && pwd -L) || return 1
  physical=$(cd -P "$path" 2>/dev/null && pwd -P) || return 1
  [[ $logical == "$physical" ]]
}
[[ $root == /* && $root != / && -f $root/.runner ]] || {
  echo 'Refusing cleanup outside a registered runner root' >&2
  exit 2
}
is_unlinked_directory "$root" || {
  echo 'Refusing cleanup through a linked runner root' >&2
  exit 2
}
[[ $(uname -s) == Darwin && $EUID -ne 0 ]] || {
  echo 'Run cleanup as the dedicated macOS account' >&2
  exit 2
}
work=$root/_work
job_temp=$work/_temp
case $phase in
  started)
    checkout=$work/oseo/oseo
    [[ ! -L $work && ! -L $work/oseo && ! -L $checkout ]] || {
      echo 'Refusing a linked checkout path' >&2
      exit 2
    }
    if [[ -d $checkout ]]; then
      find "$checkout" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
    fi
    if [[ -d $job_temp && ! -L $job_temp ]]; then
      rm -f -- "$job_temp/duration.json"
    fi
    ;;
  completed)
    if [[ -d $work && ! -L $work ]]; then
      find "$work" -mindepth 1 -maxdepth 1 ! -name _temp \
        -exec rm -rf -- {} +
      if [[ -d $job_temp && ! -L $job_temp ]]; then
        find "$job_temp" -mindepth 1 -maxdepth 1 \
          -exec rm -rf -- {} +
      fi
    fi
    ;;
  *)
    echo 'Cleanup phase must be started or completed' >&2
    exit 2
    ;;
esac
diag=$root/_diag
if [[ -d $diag && ! -L $diag ]]; then
  find "$diag" -type f -mtime +7 -delete || true
fi
free_kib=$(df -Pk "$root" | awk 'NR == 2 {print $4}') || true
low_free=false
if [[ $free_kib =~ ^[0-9]+$ && $free_kib -lt 41943040 ]]; then
  low_free=true
fi
# Per-account Zig cache size cap in GiB. install-service.sh writes it into
# the LaunchDaemon environment; docs/evidence/u26/ derives the default.
cap_gib=${OSEO_ZIG_CACHE_CAP_GIB:-30}
if [[ ! $cap_gib =~ ^[1-9][0-9]?$ || $cap_gib -gt 38 ]]; then
  echo 'Invalid OSEO_ZIG_CACHE_CAP_GIB; using the 30 GiB default' >&2
  cap_gib=30
fi
runner_user=$(id -un 2>/dev/null) || runner_user=''
account_home=''
if [[ -n $runner_user ]]; then
  account_home=$(
    dscl . -read "/Users/$runner_user" NFSHomeDirectory 2>/dev/null |
      sed -n 's/^NFSHomeDirectory: //p'
  ) || account_home=''
fi
physical_home=''
if [[ $account_home != / ]] &&
    is_unlinked_directory "$account_home"; then
  physical_home=$(cd -P "$account_home" && pwd -P) || physical_home=''
fi
if [[ -z $physical_home ]]; then
  echo 'Skipped Zig cache prune: account home unavailable or linked' >&2
else
  cache_parent=$physical_home/.cache
  cache=$cache_parent/zig
  if [[ -d $cache ]]; then
    if [[ ! -L $cache ]] &&
        is_unlinked_directory "${HOME:-}" &&
        [[ $(cd -P "$HOME" && pwd -P) == "$physical_home" ]] &&
        is_unlinked_directory "$cache_parent"; then
      reason=''
      if [[ $low_free == true ]]; then
        reason='free disk fell below 40 GiB'
      elif cache_kib=$(
          cd -P "$cache_parent" &&
            [[ $(pwd -P) == "$cache_parent" && ! -L zig ]] &&
            du -skPx zig | awk 'NR == 1 {print $1}'
        ) && [[ $cache_kib =~ ^[0-9]+$ ]]; then
        if ((cache_kib > cap_gib * 1048576)); then
          reason="it exceeded the $cap_gib GiB cap"
        fi
      else
        echo 'Skipped Zig cache cap: size measurement failed' >&2
      fi
      if [[ -n $reason ]]; then
        if (cd -P "$cache_parent" &&
            [[ $(pwd -P) == "$cache_parent" ]] &&
            rm -rf -- zig); then
          echo "Pruned Zig cache because $reason"
        else
          echo 'Skipped Zig cache prune: path changed or removal failed' >&2
        fi
      fi
    else
      echo 'Skipped Zig cache prune: unsafe home or cache path' >&2
    fi
  fi
fi
