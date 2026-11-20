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
import process from "node:process";

import { createDenoHost, createNodeHost } from "../../src/index.ts";

const mode = process.argv[2] ?? "direct";
const nodeHost = mode.startsWith("deno")
  ? undefined
  : createNodeHost({ delegateSpawns: mode.startsWith("delegated") });
const host = nodeHost ?? createDenoHost();
try {
  const result = await host.run({
    command: "node",
    args: [
      "-e",
      `const b = require('node:fs').readFileSync(0);
       process.stdout.write(b);
       process.stderr.write(b); process.exitCode = 23;`,
    ],
    cwd: process.cwd(),
    inheritStdin: !mode.endsWith("-eof"),
    inheritOutput: true,
  });
  assert.deepEqual(result, { exitStatus: 23, stdout: "", stderr: "" });
  process.exitCode = result.exitStatus;
} finally {
  await nodeHost?.close();
}
