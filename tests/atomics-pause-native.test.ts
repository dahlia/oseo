/* eslint-disable no-await-in-loop -- Native builds run serially. */

/*
 * Fixed native fixtures of the atomics-pause unit. Both reference hosts
 * expose Atomics.pause, so each fixture must match Node.js and Deno byte
 * for byte under both specialization policies with collection forced at
 * every safepoint. The structural test checks that the runtime's
 * processor hint matches each target description's `atomicsPauseHint`.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import process from "node:process";
import test from "node:test";

import { cBackend } from "../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
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
import { atomicsPauseFixtures } from "./native/fixtures/atomics-pause.ts";

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

test("the runtime's pause hint matches each target description", async () => {
  const source = await readFile(
    new URL("../packages/runtime-c/native/runtime_atomics.c", import.meta.url),
    "utf8",
  );
  const instructions = {
    "aarch64-yield": { instruction: "yield", macro: "__aarch64__" },
    "x86-pause": { instruction: "pause", macro: "__x86_64__" },
  };
  for (const name of [
    "linux-aarch64-musl",
    "linux-x86_64-gnu",
    "macos-aarch64",
  ] as const) {
    const target = describeTarget(name);
    const expected = instructions[target.atomicsPauseHint];
    assert.match(
      source,
      new RegExp(
        `defined\\(${expected.macro}\\)\\n {4}__asm__ __volatile__` +
          `\\("${expected.instruction}"\\);`,
        "u",
      ),
      name,
    );
    assert.equal(
      expected.macro,
      target.architecture === "x86_64" ? "__x86_64__" : "__aarch64__",
    );
  }
  assert.match(source, /#error "Atomics\.pause has no processor hint/u);
});

for (const fixture of atomicsPauseFixtures) {
  test(`Atomics.pause fixture ${fixture.name}`, { skip }, async () => {
    const directory = await host.makeTemporaryDirectory("oseo-pause-");
    const path = `${directory}/${fixture.name}.ts`;
    let observed;
    try {
      await host.writeTextFile(path, referencePrelude + fixture.source);
      observed = [
        await host.run({
          args: [path],
          command: process.execPath,
          cwd: directory,
        }),
        await host.run({
          args: ["run", "--quiet", path],
          command: "deno",
          cwd: directory,
        }),
      ];
    } finally {
      await host.remove(directory);
    }
    for (const observation of observed) {
      assert.equal(observation.exitStatus, 0, observation.stderr);
    }
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
