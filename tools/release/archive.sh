#!/usr/bin/env bash
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

set -euo pipefail

target=${1:?native target required}
version=${RELEASE_VERSION:?release version required}
root=${RUNNER_TEMP:-${TMPDIR:?scratch directory required}}
output="$root/release-cli"
mkdir "$output"
node tools/build-sea.ts "$output" "$version"
archive="$output/oseo-$version-$target.tar.bz2"
node tools/smoke-sea.ts "$archive" "$version"

node --input-type=module -e '
  import { execFileSync } from "node:child_process";
  import { seal } from "./tools/release/artifacts.ts";
  seal(process.argv[1], process.env.GITHUB_SHA ??
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim());
' "$output"
