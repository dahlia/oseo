#!/bin/bash
set -euo pipefail

case_name=${1:-}
cache_state=${2:-}
dry_run=${3:-}
case $case_name in
  probe|test262|own-keys|own-keys-isolated|sanitizer) ;;
  *) echo "Usage: $0 CASE cold|warm [--dry-run]" >&2; exit 2 ;;
esac
case $cache_state in
  cold|warm) ;;
  *) echo "Choose cold or warm" >&2; exit 2 ;;
esac

cache_root=${OSEO_MEASURE_CACHE_ROOT:-$HOME/Desktop/oseo-mac-measure-cache}
result_root=${OSEO_MEASURE_RESULTS:-$HOME/Desktop/oseo-mac-measure-results}
[[ $cache_root == /* && $result_root == /* ]] || {
  echo "Measurement paths must be absolute" >&2
  exit 2
}
[[ $cache_root == "$HOME/Desktop/"* && \
   ${cache_root##*/} == oseo-mac-measure-cache ]] || {
  echo "Cache must be the dedicated Desktop measurement cache" >&2
  exit 2
}
if [[ $dry_run == --dry-run ]]; then
  echo "Would run $case_name ($cache_state) at $(git rev-parse HEAD)"
  echo "Cache: $cache_root; results: $result_root"
  exit 0
fi
[[ $(uname -s) == Darwin ]] || { echo "macOS required" >&2; exit 2; }
if [[ $cache_state == cold ]]; then
  rm -rf -- "$cache_root"
fi
mkdir -p "$cache_root" "$result_root"
export ZIG_GLOBAL_CACHE_DIR=$cache_root
export TMPDIR=${OSEO_MEASURE_TMPDIR:-$result_root/tmp}
mkdir -p "$TMPDIR"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
prefix="$result_root/$stamp-$$-$case_name-$cache_state"
{
  echo "sha=$(git rev-parse HEAD)"
  echo "case=$case_name"
  echo "cache=$cache_state"
  echo "tmpdir=$TMPDIR"
  parallelism=$(node -p 'require("node:os").availableParallelism()')
  echo "available_parallelism=$parallelism"
  sw_vers
  xcode-select -p
  clang --version
  zig version
  if [[ $case_name != probe ]]; then
    echo "setup-begin=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    /usr/bin/time -p mise run build
    if [[ $case_name == sanitizer ]]; then
      export OSEO_HOST_CC=clang
      export OSEO_NATIVE_TOOLCHAIN=host-cc
    fi
    archive_info=$(node tests/ci-runtime-archive-cache.ts)
    echo "$archive_info"
    archive_path=$(printf '%s\n' "$archive_info" | sed -n 's/^path=//p')
    if [[ -f $archive_path ]]; then
      echo "runtime_archive_present_before_test=true"
    else
      echo "runtime_archive_present_before_test=false"
    fi
    echo "setup-end=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  fi
  case $case_name in
    probe)
      python3 docs/evidence/u17/exec-probe.py.txt
      ;;
    test262)
      /usr/bin/time -p mise run test:test262 --shard 8/12
      ;;
    own-keys)
      /usr/bin/time -p mise run test:property:extended:native:shard \
        --shard 1/12 tests/property/*.property.test.ts
      ;;
    own-keys-isolated)
      OSEO_PROPERTY_RUN_SCALE=10 \
      OSEO_PROPERTY_SEED=1592590339 \
      OSEO_PROPERTY_SIZE=large \
      /usr/bin/time -p node --test --test-concurrency=1 \
        tests/property/m5-object-own-keys.property.test.ts
      ;;
    sanitizer)
      /usr/bin/time -p mise run test:sanitizer:native
      ;;
  esac
} > "$prefix.log" 2>&1
echo "Result: $prefix.log"
