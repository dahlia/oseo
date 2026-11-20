/* eslint-disable no-await-in-loop -- Native policies run in isolation. */
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

import { cBackend } from "../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../packages/testkit/src/index.ts";
import { nativeToolchain } from "./native-toolchain.ts";
import { bindingFixtures } from "./native/fixtures/bindings.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

test(
  "strict optional with tail calls keep receiver and heap arguments live",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    const fixture = bindingFixtures.find(
      (item) => item.name === "with-optional-call-receiver-tail",
    );
    assert.ok(fixture != null);
    const directory = await host.makeTemporaryDirectory("oseo-with-tail-");
    const sourcePath = `${directory}/case.js`;
    try {
      await host.writeTextFile(
        sourcePath,
        `(0, eval)(${JSON.stringify(fixture.source)});`,
      );
      const references = await Promise.all([
        host.run({ command: "node", args: [sourcePath], cwd: directory }),
        host.run({
          command: "deno",
          args: ["run", "--quiet", sourcePath],
          cwd: directory,
        }),
      ]);
      assert.equal(references[0]?.exitStatus, 0);
      assert.equal(references[0]?.stderr, "");
      assertMatchingObservations(references);
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileSource(
          babelFrontend,
          {
            source: fixture.source,
            sourceId: "with-optional-call-receiver-tail.js",
          },
          { observeSpecialization: true, specialization },
        );
        assert.deepEqual(compiled.diagnostics, []);
        assert.ok(compiled.mir != null);
        process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
        try {
          await withNativeFixture(
            {
              backend: cBackend,
              host,
              input: compiled.mir,
              operation: "execute",
              runtime: cRuntimeProvider,
              target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
              toolchain: nativeToolchain,
            },
            (native) => {
              assertMatchingObservations([...references, native]);
              assert.ok((native.counters?.collections ?? 0) > 0);
            },
          );
        } finally {
          delete process.env.OSEO_GC_EVERY_SAFEPOINT;
        }
      }
    } finally {
      await host.remove(directory);
    }
  },
);
