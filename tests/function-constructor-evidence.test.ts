/* eslint-disable no-await-in-loop -- Native builds are isolated and serial. */
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
import { hostScriptReferences } from "./native/host-script-reference.ts";
import * as fc from "./native/fixtures/function-constructor-evidence.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);

for (const fixture of fc.functionConstructorFixtures) {
  test(
    `${fixture.name} observes its bounded witness with forced GC`,
    { skip: nativeTarget == null ? "requires a supported native host" : false },
    async () => {
      const expected = {
        exitStatus: 0,
        stderr: "",
        stdout: `${fixture.name} ok\n`,
      };
      assertMatchingObservations([
        expected,
        ...(await hostScriptReferences(host, fixture.source)),
      ]);
      const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source: fixture.source, sourceId: `${fixture.name}.js` },
            {
              specialization,
              observeSpecialization: true,
              test262Host: fixture.test262Host === true,
            },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          assert.ok(compiled.mir.test262Host!.scripts!.length > 0);
          assert.ok(
            compiled.mir.test262Host!.scripts!.every(
              (script) => script.error == null,
            ),
          );
          await withNativeFixture(
            {
              backend: cBackend,
              host,
              input: compiled.mir,
              operation: "execute",
              runtime: cRuntimeProvider,
              target: nativeTarget!,
              toolchain: nativeToolchain,
            },
            (native) => {
              assertMatchingObservations([expected, native]);
              assert.ok(native.counters != null);
              assert.ok(native.counters.allocations > 0);
              assert.ok(native.counters.collections > 0);
              assert.match(native.emittedC, /oseo_call/u);
              assert.match(native.emittedC, /oseo_test262_host_install/u);
            },
          );
        }
      } finally {
        if (saved == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
        else process.env.OSEO_GC_EVERY_SAFEPOINT = saved;
      }
    },
  );
}
