#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
common=(-std=c11 -Wall -Wextra -Werror -pedantic)

echo "zig=$(zig version)"
for layout in nanbox lowtag; do
  source="$root/experiments/value/$layout.c"
  zig cc -target x86_64-linux-gnu "${common[@]}" -fsanitize=undefined \
    "$source" -o "$temporary/$layout"
  "$temporary/$layout"
  for target in x86_64-linux-gnu aarch64-linux-musl; do
    architecture=${target%%-*}
    assembly="$temporary/$layout-$architecture.s"
    zig cc -target "$target" -std=c11 -O2 -g0 \
      -Wno-unused-command-line-argument -S "$source" -o "$assembly"
    node "$root/experiments/measure-assembly.ts" "$assembly" "$architecture" \
      "${layout}_is_number" "${layout}_box_smi" \
      "${layout}_unbox_smi" "${layout}_is_heap"
  done
done
