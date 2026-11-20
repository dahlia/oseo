/*
 * Oseo, an ahead-of-time compiler for JavaScript and TypeScript.
 * Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { runNativeFixture } from "../tools/native-fixture.ts";
import { hostCcLane } from "./native-toolchain.ts";
import { buildHostCcFixture } from "./host-cc-runtime.ts";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const runtime = join(root, "packages/runtime-c/native");
const runtimeSources = cRuntimeProvider
  .getRuntimeInput()
  .assets.filter((asset) => asset.kind === "source")
  .map((asset) => fileURLToPath(asset.url));
const fixture = join(root, "tests/fixtures/runtime-tail-calls.c");
const zigNativeTarget =
  process.platform === "linux" && process.arch === "x64"
    ? "x86_64-linux-gnu"
    : process.platform === "darwin" && process.arch === "arm64"
      ? "aarch64-macos"
      : undefined;

function run(command: string, args: readonly string[]): string {
  const optionsForRun = {
    cwd: root,
    encoding: "utf8" as const,
  };
  const result =
    command === "zig"
      ? spawnSync(command, args, optionsForRun)
      : runNativeFixture(command, args, optionsForRun);
  assert.equal(
    result.status,
    0,
    [
      `${command} ${args.join(" ")}`,
      `error: ${result.error?.stack ?? "none"}`,
      `signal: ${result.signal ?? "none"}`,
      `stdout: ${result.stdout ?? ""}`,
      `stderr: ${result.stderr ?? ""}`,
    ].join("\n"),
  );
  return result.stdout ?? "";
}

test(
  "performs tail call chains in bounded runtime resources",
  {
    skip: zigNativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "oseo-runtime-tail-"));
    try {
      const executable = join(directory, "runtime-tail-calls");
      const sources = [fixture, ...runtimeSources];
      if (hostCcLane) {
        buildHostCcFixture(fixture, runtime, runtimeSources, executable);
      } else
        run("zig", [
          "cc",
          "-target",
          zigNativeTarget ?? "x86_64-linux-gnu",
          "-std=c11",
          "-Wall",
          "-Wextra",
          "-Werror",
          "-fsanitize=address,undefined",
          "-I",
          runtime,
          ...sources,
          "-o",
          executable,
        ]);
      // The fixture asserts each chain's depth, root, and result
      // invariants itself; the host intrinsic step prints its argument.
      assert.equal(run(executable, []), "3\ntail calls complete\n");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  },
);
