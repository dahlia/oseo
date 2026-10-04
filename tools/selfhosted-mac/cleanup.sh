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
cache_parent=$HOME/.cache
cache=$cache_parent/zig
free_kib=$(df -Pk "$root" | awk 'NR == 2 {print $4}') || true
if [[ $free_kib =~ ^[0-9]+$ && $free_kib -lt 41943040 &&
      -d $cache ]]; then
  if [[ $HOME == /* && $HOME != / && ! -L $cache ]] &&
      is_unlinked_directory "$HOME" &&
      is_unlinked_directory "$cache_parent"; then
    (cd -P "$cache_parent" && rm -rf -- zig)
    echo 'Pruned Zig cache because free disk fell below 40 GiB'
  else
    echo 'Skipped Zig cache prune through a linked path' >&2
  fi
fi
