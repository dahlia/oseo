/* eslint-disable no-await-in-loop -- Native policies run separately. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { createHash } from "node:crypto";
import test from "node:test";
import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import {
  createDenoHost,
  createNodeHost,
} from "../../packages/host/src/index.ts";
import { babelFrontend } from "../../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import { withNativeFixture } from "../../packages/testkit/src/index.ts";
import { nativeToolchain } from "../native-toolchain.ts";
import {
  primitiveSetBoundaries,
  primitiveSetCases,
  primitiveSetExpected,
  primitiveSetProgram,
} from "../helpers/primitive-receiver-set.ts";
import {
  primitiveSetterSource,
  primitiveSetterExpected,
  primitiveComputedSetterSource,
  primitiveComputedSetterExpected,
  primitiveSetControlsSource,
  primitiveSetControlsExpected,
  primitiveSetArraySource,
  primitiveSetArrayExpected,
} from "../native/fixtures/primitive-receiver-inherited-set.ts";

import {
  annexbIdentityExpected,
  annexbIdentityDenoExpected,
  annexbIdentityProgram,
} from "../helpers/annexb-identity.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);
const isDeno = "Deno" in globalThis;
const host = isDeno ? createDenoHost() : createNodeHost();
const actualNode = isDeno ? "node" : process.execPath;
const actualDeno = isDeno ? process.execPath : "deno";
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

async function observe(
  source: string,
  expected: string,
  denoExpected = expected,
): Promise<void> {
  assert.ok(nativeTarget != null);
  const directory = await host.makeTemporaryDirectory("oseo-primitive-set-");
  const path = `${directory}/case.js`;
  try {
    await host.writeTextFile(path, `(0, eval)(${JSON.stringify(source)});\n`);
    for (const referenceHost of [
      { command: actualNode, args: [path] },
      { command: actualDeno, args: ["run", "--quiet", path] },
    ]) {
      const reference = await host.run({
        ...referenceHost,
        cwd: directory,
      });
      assert.equal(reference.exitStatus, 0, reference.stderr);
      assert.equal(reference.stderr, "");
      assert.equal(
        reference.stdout,
        referenceHost.command === actualDeno ? denoExpected : expected,
      );
    }
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source, sourceId: "primitive-receiver-set.js" },
        { observeSpecialization: true, specialization },
      );
      assert.deepEqual(compiled.diagnostics, []);
      assert.ok(compiled.mir != null);
      const previous = process.env.OSEO_GC_EVERY_SAFEPOINT;
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        await withNativeFixture(
          {
            backend: cBackend,
            host,
            input: compiled.mir,
            operation: "execute",
            runtime: cRuntimeProvider,
            target: nativeTarget,
            toolchain: nativeToolchain,
          },
          (native) => {
            assert.equal(native.stdout, expected);
            assert.equal(native.stderr, "");
            assert.ok((native.counters?.collections ?? 0) > 0);
            // Retain each original/generated subject and actual observation.
            // A successful assertion alone does not reveal numeric counters.
            process.stderr.write(
              JSON.stringify({
                kind: "primitive-set-native-observation",
                sourceSha256: createHash("sha256").update(source).digest("hex"),
                source,
                specialization,
                stdout: native.stdout,
                stderr: native.stderr,
                counters: native.counters,
              }) + "\n",
            );
          },
        );
      } finally {
        if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
        else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
      }
    }
  } finally {
    await host.remove(directory);
  }
}

test(
  "generated primitive inherited Set retains the original receiver",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    await assertAsyncProperty(
      "primitive Set preserves descriptor precedence and receiver identity",
      fc.asyncProperty(primitiveSetCases, async (value) => {
        await observe(primitiveSetProgram(value), primitiveSetExpected(value));
        // A fresh realm retains the original generated subject unchanged.
        // The same integer shrinks this reflection state without a new seed.
        await observe(
          annexbIdentityProgram(value.integer),
          annexbIdentityExpected,
          annexbIdentityDenoExpected,
        );
      }),
      {
        context: [
          `host=${host.executionHost?.operatingSystem}/` +
            host.executionHost?.architecture,
          `target=${nativeTarget?.name}`,
          `sanitizers=${nativeTarget?.sanitizers.join(",")}`,
        ],
        domain:
          "five primitive kinds, objects and nullish values; nine " +
          "descriptor/Proxy outcomes, five key classes, " +
          "independent strictness; " +
          "reflectable excluded identities, partial replacement and integrity",
        numRuns: 12,
        profile: "M5 primitive receiver inherited Set",
        seed: 0x6000_8c00,
        sizeLimit:
          "eight receivers, two stores each, at most two extra " +
          "prototype levels, bounded integers and heap-valued RHS",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);

test(
  "fixed primitive Set regressions retain values through collection",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    for (const [source, expected] of [
      [primitiveSetterSource, primitiveSetterExpected],
      [primitiveComputedSetterSource, primitiveComputedSetterExpected],
      [primitiveSetControlsSource, primitiveSetControlsExpected],
      [primitiveSetArraySource, primitiveSetArrayExpected],
    ] as const)
      await observe(source, expected);
    for (const value of primitiveSetBoundaries()) {
      await observe(primitiveSetProgram(value), primitiveSetExpected(value));
      // A fresh realm retains the original generated subject unchanged.
      // The same integer shrinks this reflection state without a new seed.
      await observe(
        annexbIdentityProgram(value.integer),
        annexbIdentityExpected,
        annexbIdentityDenoExpected,
      );
    }
  },
);

test(
  "primitive Set allocation failures and foreign setters balance roots",
  {
    skip: nativeTarget == null ? "requires a supported native host" : false,
  },
  async () => {
    assert.ok(nativeTarget != null);
    const compiled = compileSource(babelFrontend, {
      source: "0;",
      sourceId: "primitive-set-allocation.js",
    });
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const source = await readFile(
      new URL(
        "../fixtures/primitive-receiver-inherited-set/allocation.c",
        import.meta.url,
      ),
      "utf8",
    );
    await withNativeFixture(
      {
        backend: { emit: () => ({ sourceName: "allocation.c", source }) },
        host,
        input: compiled.mir,
        operation: "execute",
        runtime: cRuntimeProvider,
        target: nativeTarget,
        toolchain: nativeToolchain,
      },
      (native) => {
        assert.equal(native.stdout, "primitive Set roots and realms passed\n");
        assert.equal(native.stderr, "");
      },
    );
  },
);
