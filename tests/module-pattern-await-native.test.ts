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
import process from "node:process";
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
  new URL("./fixtures/module-pattern-await/importer.mjs", import.meta.url),
);
const expected = [
  "bindings 7 8 export,key,default",
  "lazy null 0",
  "assignment 9 true",
  "rest 10",
  "catch 11",
  "finally",
  "reject finally",
  "reject rejected",
  "next",
  "close",
  "iterator iterator rejection",
  "for 12",
  "of 13",
  "in 2",
  "coerce",
  "coerced 14",
  "nested 15 0",
  "import 7",
  "",
].join("\n");

test(
  "module patterns retain ordering and cleanup across suspension",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const [command, args] of [
      ["node", [entry]],
      ["deno", ["run", "--quiet", entry]],
    ] as const) {
      const result = await host.run({
        command,
        args,
        cwd: fileURLToPath(new URL("..", import.meta.url)),
      });
      assert.equal(result.exitStatus, 0, result.stderr);
      assert.equal(result.stderr, "");
      assert.equal(result.stdout, expected, command);
    }
    const previous = process.env.OSEO_GC_EVERY_SAFEPOINT;
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      for (const specialization of ["disabled", "enabled"] as const) {
        const result = await runNativeCli(
          {
            args: [
              ...(specialization === "disabled" ? ["--no-specialization"] : []),
              entry,
            ],
            version: "0.1.0",
          },
          host,
        );
        assert.equal(result.exitStatus, 0, result.stderr);
        assert.equal(result.stderr, "");
        assert.equal(result.stdout, expected, specialization);
      }
    } finally {
      if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
    }
  },
);
