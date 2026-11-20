/* eslint-disable no-await-in-loop -- Native policies run serially. */
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
import test from "node:test";
import { fileURLToPath } from "node:url";

import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { runNativeCli } from "./native-cli.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const entry = fileURLToPath(
  new URL(
    "./fixtures/module-default-namespace-update/entry.mjs",
    import.meta.url,
  ),
);

test(
  "a static namespace reads the updated default binding after calling it",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const expected = "1\n2\n";
    for (const [command, args] of [
      [process.execPath, [entry]],
      ["deno", ["run", "--quiet", entry]],
    ] as const) {
      const reference = await host.run({
        command,
        args,
        cwd: fileURLToPath(new URL("..", import.meta.url)),
      });
      assert.equal(reference.exitStatus, 0, reference.stderr);
      assert.equal(reference.stderr, "");
      assert.equal(reference.stdout, expected);
    }
    for (const specialization of ["disabled", "enabled"] as const) {
      const native = await runNativeCli(
        {
          args: [
            ...(specialization === "disabled" ? ["--no-specialization"] : []),
            entry,
          ],
          version: "0.1.0",
        },
        host,
      );
      assert.equal(native.exitStatus, 0, native.stderr);
      assert.equal(native.stderr, "");
      assert.equal(native.stdout, expected, specialization);
    }
  },
);
