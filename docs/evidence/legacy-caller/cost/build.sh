#!/bin/sh
# Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
# Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

# Build each benchmark against the runtime at BASE and the working tree.
# Usage: build.sh BASE OUTPUT_DIRECTORY, from the repository root after
# `mise run build`. The base program is the current emission with the
# non-strict creation entry renamed to the one BASE has; nothing else in
# the emitted C differs.
set -eu
base=$1
out=$2
here=$(dirname "$0")
mkdir -p "$out/base-native" "$out/obj-base" "$out/obj-cur"
git archive "$base" packages/runtime-c/native |
  tar -x -C "$out/base-native" --strip-components=3
current=packages/runtime-c/native
for file in "$out"/base-native/*.c; do
  zig cc -std=c11 -O2 -I"$out/base-native" -c "$file" \
    -o "$out/obj-base/$(basename "$file" .c).o"
done
for file in "$current"/*.c; do
  zig cc -std=c11 -O2 -I"$current" -c "$file" \
    -o "$out/obj-cur/$(basename "$file" .c).o"
done
for bench in sloppy-calls strict-calls builtin-callbacks; do
  node packages/cli/dist/main.js --emit-c "$here/$bench.js" >"$out/$bench.cur.c"
  sed 's/oseo_function_create_non_strict(/oseo_function_create(/g' \
    "$out/$bench.cur.c" >"$out/$bench.base.c"
  zig cc -std=c11 -O2 -I"$out/base-native" "$out/$bench.base.c" \
    "$out"/obj-base/*.o -lm -o "$out/$bench.base"
  zig cc -std=c11 -O2 -I"$current" "$out/$bench.cur.c" \
    "$out"/obj-cur/*.o -lm -o "$out/$bench.cur"
done
cp "$here/time.py" "$out/"
