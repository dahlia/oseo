/* eslint-disable no-await-in-loop -- Native builds run serially. */
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

/*
 * Fixed native fixtures of the annexb-function-declarations and
 * annexb-statement-forms units. They run here rather than in
 * tests/native.ts because the M5c exclusion audit binds that file by
 * digest. Each fixture compiles under both specialization policies with
 * collection forced at every safepoint. A `hosts` fixture must match
 * Node.js and Deno running it as a Script; a `model` fixture matches the
 * output written from ECMA-262 where V8 departs from it.
 */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import { cBackend } from "../packages/backend-c/src/index.ts";
import {
  compileSource,
  printMir,
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
import { annexBFunctionFixtures } from "./native/fixtures/annexb-functions.ts";
import { hostScriptReferences } from "./native/host-script-reference.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const skip = nativeTarget == null ? "requires a supported native host" : false;

test("model fixtures name the V8 departures they cover", () => {
  assert.deepEqual(
    annexBFunctionFixtures
      .filter((fixture) => fixture.reference === "model")
      .map((fixture) => fixture.name),
    ["annexb-duplicate-block-functions-model"],
  );
});

for (const fixture of annexBFunctionFixtures) {
  test(`Annex B function fixture ${fixture.name}`, { skip }, async () => {
    let expected;
    if (fixture.reference === "hosts") {
      const observed = await hostScriptReferences(host, fixture.source);
      assertMatchingObservations(observed);
      expected = observed[0]!;
      assert.equal(expected.exitStatus, 0, expected.stderr);
    } else {
      assert.ok(fixture.expected != null);
      expected = { exitStatus: 0, stderr: "", stdout: fixture.expected };
    }
    const test262Host = fixture.test262Host === true;
    const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileSource(
          babelFrontend,
          { source: fixture.source, sourceId: `${fixture.name}.js` },
          { observeSpecialization: true, specialization, test262Host },
        );
        assert.deepEqual(compiled.diagnostics, [], fixture.name);
        assert.ok(compiled.mir != null);
        const mir = printMir(compiled.mir);
        if (specialization === "enabled") {
          assert.match(mir, /guard-(?:object|shape)/u);
        } else {
          assert.doesNotMatch(mir, /guard-(?:object|shape)/u);
        }
        await withNativeFixture(
          {
            agents: compiled.agents ?? [],
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
            assert.ok(native.counters.collections > 0);
            if (specialization === "enabled") {
              assert.ok(native.counters.guardMisses > 0);
            }
          },
        );
      }
    } finally {
      if (saved == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      else process.env.OSEO_GC_EVERY_SAFEPOINT = saved;
    }
  });
}
