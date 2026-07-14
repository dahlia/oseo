#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
common=(-std=c11 -Wall -Wextra -Werror -pedantic -I "$root/experiments/native")

echo "zig=$(zig version)"
echo "native-target=x86_64-linux-gnu sanitizer=undefined"
zig cc -target x86_64-linux-gnu "${common[@]}" -fsanitize=undefined \
  -c "$root/experiments/native/runtime.c" -o "$temporary/runtime.o"
zig ar rcs "$temporary/liboseo_probe_runtime.a" "$temporary/runtime.o"
zig cc -target x86_64-linux-gnu "${common[@]}" -fsanitize=undefined \
  "$root/experiments/native/generated.c" \
  "$temporary/liboseo_probe_runtime.a" -o "$temporary/native-probe"
"$temporary/native-probe"

echo "cross-target=aarch64-linux-musl execution=compile-and-link-only"
zig cc -target aarch64-linux-musl "${common[@]}" \
  -c "$root/experiments/native/runtime.c" -o "$temporary/runtime-aarch64.o"
zig ar rcs "$temporary/liboseo_probe_runtime-aarch64.a" \
  "$temporary/runtime-aarch64.o"
zig cc -target aarch64-linux-musl "${common[@]}" \
  "$root/experiments/native/generated.c" \
  "$temporary/liboseo_probe_runtime-aarch64.a" \
  -o "$temporary/native-probe-aarch64"
echo "cross-link=passed"
