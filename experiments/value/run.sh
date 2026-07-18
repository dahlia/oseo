#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
source "$root/experiments/native-targets.sh"
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
common=(-std=c11 -Wall -Wextra -Werror -pedantic)

echo "zig=$(zig version)"
for layout in nanbox lowtag; do
  source="$root/experiments/value/$layout.c"
  zig cc -target "$oseo_zig_execution_target" "${common[@]}" \
    -fsanitize="$oseo_sanitizer" \
    "$source" -o "$temporary/$layout"
  "$temporary/$layout"
  for target in "${oseo_configured_targets[@]}"; do
    zig_target=$(oseo_zig_target "$target")
    suffix=${target//[^[:alnum:]]/-}
    assembly="$temporary/$layout-$suffix.s"
    zig cc -target "$zig_target" -std=c11 -O2 -g0 \
      -Wno-unused-command-line-argument -S "$source" -o "$assembly"
    node "$root/experiments/measure-assembly.ts" "$assembly" "$target" \
      "${layout}_is_number" "${layout}_box_smi" \
      "${layout}_unbox_smi" "${layout}_is_heap"
  done
done
