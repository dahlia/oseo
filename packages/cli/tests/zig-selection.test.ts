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
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ProcessRequest } from "@oseo/compiler";
import {
  defaultComponents,
  executeCliInvocation,
  parseCliRequest,
} from "../src/index.ts";

test("native output alone selects Zig; --zig works offline", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "oseo-cli-zig-test-"));
  t.after(() => rm(temporary, { force: true, recursive: true }));
  const zig = join(temporary, "my zig");
  await writeFile(zig, "#!/bin/sh\nexit 47\n", {
    mode: 0o755,
  });
  let requests = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    requests += 1;
    throw new Error("These invocations must not fetch Zig.");
  };
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  for (const args of [
    ["--help"],
    ["--version"],
    ["build", "--emit-c", "app.js"],
    ["build", "--dump-mir", "app.js"],
    ["build", "--emit-c", "--zig", zig, "app.js"],
  ]) {
    const request = { args, source: "console.log(42);", version: "0.0.0" };
    const parsed = parseCliRequest(request);
    const result =
      parsed.kind === "invoke"
        ? // oxlint-disable-next-line no-await-in-loop -- Shared fetch spy.
          await executeCliInvocation(parsed.value, request)
        : parsed.value;
    if (args.includes("--zig")) {
      assert.equal(result.exitStatus, 1);
      assert.match(
        result.stderr,
        /--zig option applies only to native output/u,
      );
    } else {
      assert.equal(result.exitStatus, 0, result.stderr);
    }
  }
  const request = {
    args: [
      "build",
      "--target",
      "linux-x86_64-gnu",
      "--no-runtime-archive-reuse",
      "--zig",
      zig,
      "-o",
      join(temporary, "app"),
      "app.js",
    ],
    source: "console.log(42);",
    version: "0.0.0",
  };
  const parsed = parseCliRequest(request);
  assert.equal(parsed.kind, "invoke");
  const compilerRequests: ProcessRequest[] = [];
  const built = await executeCliInvocation(parsed.value, request, {
    ...defaultComponents.createNodeHost(),
    run(processRequest) {
      compilerRequests.push(processRequest);
      return Promise.resolve({ exitStatus: 47, stdout: "", stderr: "" });
    },
  });
  assert.deepEqual(
    compilerRequests.map(({ command, args }) => [command, args[0]]),
    [[zig, "cc"]],
  );
  assert.equal(built.exitStatus, 1);
  assert.equal(
    built.stderr,
    "app.js:1:1: error[OSEO3001]: The native toolchain for " +
      "target 'linux-x86_64-gnu' failed (exit 47).\n",
  );
  assert.equal(requests, 0);
});
