#!/usr/bin/env bash
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
