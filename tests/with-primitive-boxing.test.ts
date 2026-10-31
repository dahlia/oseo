/* eslint-disable no-await-in-loop -- Native builds run serially. */
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
import { boxingFixtures } from "./native/fixtures/with-primitive-boxing.ts";
import { readFile } from "node:fs/promises";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);
const skip = nativeTarget == null ? "requires a supported native host" : false;

async function observe(
  source: string,
  stdout: string,
  test262Host: boolean,
): Promise<void> {
  const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
  process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
  try {
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source, sourceId: "with-primitive-boxing.js" },
        { specialization, test262Host, observeSpecialization: true },
      );
      assert.deepEqual(compiled.diagnostics, []);
      await withNativeFixture(
        {
          backend: cBackend,
          host,
          input: compiled.mir!,
          operation: "execute",
          runtime: cRuntimeProvider,
          target: nativeTarget!,
          toolchain: nativeToolchain,
        },
        (native) => {
          assertMatchingObservations([
            { exitStatus: 0, stderr: "", stdout },
            {
              exitStatus: native.exitStatus,
              stderr: native.stderr,
              stdout: native.stdout,
            },
          ]);
          assert.ok(native.counters!.collections > 0);
        },
      );
    }
  } finally {
    if (saved == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
    else process.env.OSEO_GC_EVERY_SAFEPOINT = saved;
  }
}

for (const test262Host of [false, true]) {
  test(
    `with boxes and retains primitives host=${test262Host}`,
    { skip },
    async () => {
      const source = boxingFixtures[0]!.source;
      const references = await hostScriptReferences(host, source);
      assertMatchingObservations(references);
      assert.equal(references[0]!.exitStatus, 0);
      await observe(source, references[0]!.stdout, test262Host);
    },
  );
}

test("original three with primitive Test262 subjects", { skip }, async () => {
  for (const suffix of [1, 2, 3]) {
    const path = "test/language/statements/with/12.10-2-" + suffix + ".js";
    const original = await readFile(
      new URL("../node_modules/test262/" + path, import.meta.url),
      "utf8",
    );
    const source = `
var assert = { sameValue(actual, expected) {
  if (!Object.is(actual, expected)) throw new Error('sameValue');
} };
${original}
console.log('passed');`;
    const references = await hostScriptReferences(host, source);
    assertMatchingObservations([
      { exitStatus: 0, stderr: "", stdout: "passed\n" },
      ...references,
    ]);
    await observe(source, "passed\n", true);
  }
});
