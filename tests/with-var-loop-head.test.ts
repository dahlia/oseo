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
import {
  withVarLoopHeadFixtures,
  withArrayBindingOrderSource,
  withArrayBindingOrderExpected,
} from "./native/fixtures/with-var-loop-head-resolution.ts";

import {
  withKeyedBindingTargetOrderSource,
  withKeyedBindingTargetOrderExpected,
} from "./native/fixtures/with-keyed-binding-target-order.ts";

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
        { source, sourceId: "with-var-loop-head.js" },
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
    `var heads resolve with records host=${test262Host}`,
    { skip },
    async () => {
      for (const fixture of withVarLoopHeadFixtures) {
        const references = await hostScriptReferences(host, fixture.source);
        assertMatchingObservations(references);
        await observe(fixture.source, references[0]!.stdout, test262Host);
      }
    },
  );
  test(`with reference order host=${test262Host}`, { skip }, async () => {
    await observe(
      withArrayBindingOrderSource,
      withArrayBindingOrderExpected,
      test262Host,
    );
  });
}

test(
  "with misses reach a later host Script lexical binding",
  { skip },
  async () => {
    const source = `
$262.evalScript('globalThis.v = 0;');
$262.evalScript('var v; $262.evalScript("let v = 1;");' +
  ' with ({}) { for (var v of [2]) {} for (var v = 3; false;) {} }' +
  ' console.log(v, globalThis.v);');
`;
    const references = await hostScriptReferences(host, source);
    // Deno's legacy var-name check rejects this later lexical declaration.
    assertMatchingObservations([
      { exitStatus: 0, stderr: "", stdout: "3 0\n" },
      references[0]!,
    ]);
    await observe(source, "3 0\n", true);
  },
);

test("keyed object identifier order remains unchanged", { skip }, async () => {
  await observe(
    withKeyedBindingTargetOrderSource,
    withKeyedBindingTargetOrderExpected,
    false,
  );
});

test(
  "with misses preserve host Script const assignment errors",
  { skip },
  async () => {
    const source = `
$262.evalScript('globalThis.v = 0;');
$262.evalScript('var v; $262.evalScript("const v = 1;");' +
  ' with ({}) {' +
  ' try { for (var v of [2]) {} } catch (e) { console.log(e.name); }' +
  ' try { for (var v in {z:0}) {} } catch (e) { console.log(e.name); }' +
  ' try { for (var v = 3; false;) {} } catch (e) { console.log(e.name); }' +
  ' } console.log(v, globalThis.v);');
`;
    const expected = "TypeError\nTypeError\nTypeError\n1 0\n";
    const references = await hostScriptReferences(host, source);
    assertMatchingObservations([
      { exitStatus: 0, stderr: "", stdout: expected },
      references[0]!,
    ]);
    await observe(source, expected, true);
  },
);
