/* eslint-disable no-await-in-loop -- Native builds run serially. */

/*
 * Fixed native fixtures of the uint8array-base64 unit. The pinned Node.js
 * lacks the methods, so each fixture runs in Node.js with the independent
 * model of tests/native/uint8array-base64-model.ts installed, and in Deno
 * as the single reference host unless the fixture is marked model-only.
 * Each fixture compiles under both specialization policies with collection
 * forced at every safepoint and must match every reference byte for byte.
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
import { base64Fixtures } from "./native/fixtures/uint8array-base64.ts";
import { base64ModelPrelude } from "./native/uint8array-base64-model.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const skip = nativeTarget == null ? "requires a supported native host" : false;

const referencePrelude = `
const oseoReferenceConsole = console;
const oseoReferenceString = String;
Object.defineProperty(globalThis, "console", {
  value: {
    log(...values: unknown[]) {
      oseoReferenceConsole.log(values.map(oseoReferenceString).join(" "));
    },
  },
});
`;

interface Observation {
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}

async function references(
  name: string,
  source: string,
  modelOnly: boolean,
): Promise<readonly Observation[]> {
  const directory = await host.makeTemporaryDirectory("oseo-base64-");
  const modelPath = `${directory}/${name}-model.ts`;
  const denoPath = `${directory}/${name}.ts`;
  try {
    await host.writeTextFile(
      modelPath,
      referencePrelude + base64ModelPrelude + source,
    );
    const observations = [
      await host.run({
        args: [modelPath],
        command: process.execPath,
        cwd: directory,
      }),
    ];
    if (!modelOnly) {
      await host.writeTextFile(denoPath, referencePrelude + source);
      observations.push(
        await host.run({
          args: ["run", "--quiet", denoPath],
          command: "deno",
          cwd: directory,
        }),
      );
    }
    for (const observation of observations) {
      assert.equal(observation.exitStatus, 0, observation.stderr);
    }
    return observations;
  } finally {
    await host.remove(directory);
  }
}

for (const fixture of base64Fixtures) {
  test(`Uint8Array base64 fixture ${fixture.name}`, { skip }, async () => {
    const observed = await references(
      fixture.name,
      fixture.source,
      fixture.modelOnly === true,
    );
    assertMatchingObservations(observed);
    const reference = observed[0]!;
    const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileSource(
          babelFrontend,
          { source: fixture.source, sourceId: `${fixture.name}.ts` },
          { observeSpecialization: true, specialization },
        );
        assert.deepEqual(compiled.diagnostics, [], fixture.name);
        assert.ok(compiled.mir != null);
        const mir = printMir(compiled.mir);
        if (specialization === "enabled") {
          assert.match(mir, /guard-object/u);
          assert.match(mir, /guard-shape/u);
          assert.match(mir, /property-get generic/u);
        } else {
          assert.doesNotMatch(mir, /guard-(?:object|shape)/u);
        }
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
            assertMatchingObservations([reference, native]);
            assert.ok(native.counters != null);
            assert.ok(native.counters.collections > 0);
            if (specialization === "enabled") {
              assert.ok(native.counters.guardMisses > 0);
              assert.ok(native.counters.guardHits > 0);
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
