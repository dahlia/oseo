/* eslint-disable no-await-in-loop -- Forced collection is process-local. */
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

import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { createDenoHost, createNodeHost } from "../packages/host/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import { withNativeFixture } from "../packages/testkit/src/index.ts";
import { balancedInteropBackend } from "./helpers/balanced-backend.ts";
import {
  compilePrimitiveSetArray,
  primitiveSetArrayCase,
} from "./helpers/primitive-set-array-interop.ts";
import { nativeToolchain } from "./native-toolchain.ts";

const host =
  Object.getOwnPropertyDescriptor(globalThis, "Deno")?.value == null
    ? createNodeHost()
    : createDenoHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

test(
  "fixed generic Set/Array interaction, both policies and forced GC",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    assert.ok(nativeTarget != null);
    const fixture = primitiveSetArrayCase;
    for (const policy of ["disabled", "enabled"] as const) {
      const mir = compilePrimitiveSetArray(policy);
      const previous = process.env.OSEO_GC_EVERY_SAFEPOINT;
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        await withNativeFixture(
          {
            backend: balancedInteropBackend,
            host,
            input: mir,
            operation: "execute",
            runtime: cRuntimeProvider,
            target: nativeTarget,
            toolchain: nativeToolchain,
          },
          (native) => {
            assert.equal(fixture.guard, false, "guard must fail execution");
            assert.equal(native.exitStatus, 0);
            assert.equal(native.stderr, "");
            assert.equal(native.stdout, fixture.stdout);
            assert.ok(native.counters != null);
            assert.ok(native.counters.allocations > 0);
            assert.ok(native.counters.collections > 0);
          },
        );
      } finally {
        if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
        else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
      }
    }
  },
);
