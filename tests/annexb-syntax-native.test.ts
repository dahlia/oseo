/* eslint-disable no-await-in-loop -- Native builds run serially. */

/*
 * Fixed native fixtures of the annexb-syntax unit. They run here rather
 * than in tests/native.ts because the M5c exclusion audit binds that file
 * by digest. Each fixture runs as a Script in both strictness modes under
 * both specialization policies, with collection forced at every safepoint,
 * and must match its Node.js and Deno Script references byte for byte.
 */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import { cBackend } from "../packages/backend-c/src/index.ts";
import { defaultComponents } from "../packages/cli/src/index.ts";
import {
  compileSource,
  printMir,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelModuleFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../packages/testkit/src/index.ts";
import { nativeToolchain } from "./native-toolchain.ts";
import {
  annexBSyntaxFixtures,
  moduleRejectedComments,
} from "./native/fixtures/annexb-syntax.ts";
import { hostScriptReferences } from "./native/host-script-reference.ts";

// The command-line frontend links the Unicode data an ignore-case literal
// needs, as a build does.
const frontend = defaultComponents.frontend;
const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const skip = nativeTarget == null ? "requires a supported native host" : false;

for (const fixture of annexBSyntaxFixtures) {
  test(`Annex B syntax fixture ${fixture.name}`, { skip }, async () => {
    const references = await hostScriptReferences(host, fixture.source);
    assertMatchingObservations(references);
    const reference = references[0]!;
    assert.equal(reference.exitStatus, 0, reference.stderr);
    assert.notEqual(reference.stdout, "");
    const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      for (const specialization of ["disabled", "enabled"] as const) {
        for (const strict of [false, true]) {
          const compiled = compileSource(
            frontend,
            {
              source: `${strict ? '"use strict";\n' : ""}${fixture.source}`,
              sourceId: `${fixture.name}.js`,
            },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, [], fixture.name);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "disabled") {
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
              // The dynamic fixture's reader sees a RegExp and then a
              // plain object, so its guard misses at least once.
              if (
                specialization === "enabled" &&
                fixture.name === "annexb-regexp-dynamic"
              ) {
                assert.match(mir, /guard-shape/u);
                assert.ok(native.counters.guardMisses > 0);
              }
            },
          );
        }
      }
    } finally {
      if (saved == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      else process.env.OSEO_GC_EVERY_SAFEPOINT = saved;
    }
  });
}

// Annex B's comment syntax extends Script alone; a module keeps the
// early errors of the core grammar.
for (const source of moduleRejectedComments) {
  test(`a module rejects ${JSON.stringify(source)}`, () => {
    const result = babelModuleFrontend.parseModule({
      source,
      sourceId: "annexb-html-comment.mjs",
    });
    assert.equal(result.module, undefined);
    assert.ok(result.diagnostics.length > 0);
    assert.ok(result.diagnostics.every((d) => d.code === "OSEO0001"));
  });
}
