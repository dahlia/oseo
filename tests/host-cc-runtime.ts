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

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { renameSync } from "node:fs";
import { dirname } from "node:path";
import { describeTarget } from "../packages/compiler/src/index.ts";
import { nativeToolchain } from "./native-toolchain.ts";

/** Compile C fixtures with the same adapter as generated native programs. */
export function buildHostCcFixture(
  fixture: string,
  runtimeDirectory: string,
  runtimeSourcePaths: readonly string[],
  executable: string,
): readonly string[] {
  const target = describeTarget(
    process.platform === "darwin" ? "macos-aarch64" : "linux-x86_64-gnu",
  );
  const variables = Object.fromEntries(
    (nativeToolchain.environment?.inherit ?? []).flatMap((name) => {
      const value = process.env[name];
      return value == null ? [] : [[name, value]];
    }),
  );
  const plan = nativeToolchain.createBuildPlan({
    generatedSourcePath: fixture,
    runtimeDirectory,
    runtimeSourcePaths,
    target,
    workingDirectory: dirname(executable),
    environment: { variables },
  });
  for (const request of plan.requests) {
    const result = spawnSync(request.command, request.args, {
      cwd: request.cwd,
      env: variables,
      encoding: "utf8",
      timeout: 120_000,
    });
    assert.equal(
      result.status,
      0,
      `${nativeToolchain.identity}\n${result.error ?? ""}\n${result.stderr}`,
    );
  }
  renameSync(plan.executablePath, executable);
  return [
    nativeToolchain.identity ?? "unknown compiler",
    ...plan.requests.map((request) =>
      [request.command, ...request.args].join(" "),
    ),
  ];
}
