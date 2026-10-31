/* eslint-disable no-await-in-loop -- Native builds are isolated. */
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
import { withNativeFixture } from "../packages/testkit/src/index.ts";
import { callableCases } from "./native/fixtures/callable-object-evidence.ts";
import { hostScriptReferences } from "./native/host-script-reference.ts";
import { nativeToolchain } from "./native-toolchain.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);

for (const fixture of callableCases) {
  test(`DS-14 static lowering: ${fixture.name}`, () => {
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source: fixture.source, sourceId: `${fixture.name}.js` },
        { specialization },
      );
      assert.deepEqual(compiled.diagnostics, []);
      assert.ok(compiled.mir != null);
      const text = printMir(compiled.mir);
      assert.match(text, /call dynamic function value/u);
      assert.match(text, /function-create/u);
      if (fixture.name.endsWith("intrinsic-constructability")) {
        assert.match(text, /async function @f\d+ asyncDeclaration/u);
        assert.match(text, /constant "construct"/u);
        assert.match(text, /binary instanceof/u);
      }
      if (fixture.name.endsWith("ordinary-call-and-construction")) {
        assert.match(text, /name="Factory" length=0/u);
        assert.match(text, /name="ArgsFactory" length=2/u);
      }
      if (fixture.name.endsWith("object-literal-accessors")) {
        assert.match(text, /property-define-accessor define get accessor/u);
        assert.match(text, /property-define-accessor define set accessor/u);
      }
      if (fixture.name.endsWith("function-subclass-partial")) {
        assert.match(text, /class-heritage class heritage/u);
        assert.match(text, /construct dynamic constructor/u);
      }
      // Dynamic source is rejected before MIR: every witness instead has
      // compiled bodies and uses the generic native call ABI.
      assert.ok(compiled.mir.functions.length > 0);
      assert.doesNotMatch(fixture.source, /\beval\s*\(|new Function\s*\(/u);
    }
  });

  test(
    `DS-14 native witness: ${fixture.name}`,
    { skip: nativeTarget == null ? "requires a supported native host" : false },
    async () => {
      assert.ok(nativeTarget != null);
      const expected = `ok ${fixture.name.slice("callable-object-".length)}\n`;
      for (const reference of await hostScriptReferences(
        host,
        fixture.source,
      )) {
        assert.equal(reference.exitStatus, 0, reference.stderr);
        assert.equal(reference.stderr, "");
        assert.equal(reference.stdout, expected);
      }
      const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source: fixture.source, sourceId: `${fixture.name}.js` },
            { specialization, observeSpecialization: true },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
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
              assert.equal(native.exitStatus, 0, native.stderr);
              assert.equal(native.stderr, "");
              assert.equal(native.stdout, expected);
              assert.ok(native.counters != null);
              assert.ok(native.counters.collections > 0);
              assert.match(native.emittedC, /OseoResult/u);
              if (specialization === "disabled") {
                assert.equal(native.counters.guardHits, 0);
                assert.equal(native.counters.guardMisses, 0);
              } else {
                assert.ok(native.counters.guardHits > 0);
                assert.ok(native.counters.guardMisses > 0);
                assert.ok(native.counters.genericAdditionCalls > 0);
              }
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
