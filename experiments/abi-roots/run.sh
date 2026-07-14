#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
source="$root/experiments/abi-roots/probe.c"

echo "zig=$(zig version)"
echo "native-target=x86_64-linux-gnu sanitizer=undefined"
zig cc -target x86_64-linux-gnu -std=c11 -Wall -Wextra -Werror -pedantic \
  -fsanitize=undefined "$source" -o "$temporary/abi-roots"
"$temporary/abi-roots"

for target in x86_64-linux-gnu aarch64-linux-musl; do
  architecture=${target%%-*}
  assembly="$temporary/abi-roots-$architecture.s"
  zig cc -target "$target" -std=c11 -O2 -g0 \
    -Wno-unused-command-line-argument -S "$source" -o "$assembly"
  node "$root/experiments/measure-assembly.ts" "$assembly" "$architecture" \
    oseo_smi_add_nonthrow oseo_add_status oseo_add_result
done
