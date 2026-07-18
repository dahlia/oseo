#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
source "$root/experiments/native-targets.sh"
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
source="$root/experiments/abi-roots/probe.c"

echo "zig=$(zig version)"
echo "native-target=$oseo_execution_target sanitizer=$oseo_sanitizer"
zig cc -target "$oseo_zig_execution_target" -std=c11 \
  -Wall -Wextra -Werror -pedantic \
  -fsanitize="$oseo_sanitizer" "$source" -o "$temporary/abi-roots"
"$temporary/abi-roots"

for target in "${oseo_configured_targets[@]}"; do
  zig_target=$(oseo_zig_target "$target")
  suffix=${target//[^[:alnum:]]/-}
  assembly="$temporary/abi-roots-$suffix.s"
  zig cc -target "$zig_target" -std=c11 -O2 -g0 \
    -Wno-unused-command-line-argument -S "$source" -o "$assembly"
  node "$root/experiments/measure-assembly.ts" "$assembly" "$target" \
    oseo_smi_add_nonthrow oseo_add_status oseo_add_result
done
