/* eslint-disable no-await-in-loop -- Native builds are isolated and serial. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
import {
  inlineCases,
  inlineFixtures,
  inlineOriginal,
  inlineProgram,
} from "./native/fixtures/eval-code-inline-evidence.ts";
import { cookedArgument } from "./native/fixtures/host-script-evidence.ts";
import { hostScriptReferences } from "./native/host-script-reference.ts";
import { nativeToolchain } from "./native-toolchain.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);
const skip = nativeTarget == null ? "requires a supported native host" : false;

test("inline witnesses select nine distinct pinned originals", () => {
  const selected = new Set(
    readFileSync(
      new URL(
        "../docs/m5c-graph/dynamic-source-eval-code-assessment.paths.txt",
        import.meta.url,
      ),
      "utf8",
    )
      .trim()
      .split("\n"),
  );
  assert.equal(selected.size, 48);
  const paths = inlineCases.map((subject) => subject.path);
  assert.equal(new Set(paths).size, 9);
  for (const path of paths) assert.ok(selected.has(path), path);
});

for (const subject of inlineCases) {
  test(`inline witness keeps the original: ${subject.path}`, () => {
    const original = inlineOriginal(subject);
    assert.equal(
      createHash("sha256").update(original).digest("hex"),
      subject.sha256,
    );
    const frontmatter = original.slice(0, original.indexOf("---*/"));
    const flags = /^flags: \[(.*)\]$/mu.exec(frontmatter)?.[1] ?? "";
    assert.deepEqual(
      subject.modes,
      flags.includes("onlyStrict")
        ? ["strict"]
        : flags.includes("noStrict")
          ? ["sloppy"]
          : ["sloppy", "strict"],
    );
    assert.doesNotMatch(flags, /module|raw/u);
    assert.doesNotMatch(frontmatter, /^(?:negative|includes):/mu);
    const body = original.slice(frontmatter.length);
    assert.equal(
      body.match(/\beval\(/gu)?.length ?? 0,
      subject.calls.length,
      "every eval call is replaced",
    );
    for (const call of subject.calls) {
      assert.equal(cookedArgument(call.call), call.source);
      const expression = call.source
        .replace(/^"use strict"; /u, "")
        .replace(/;$/u, "");
      assert.equal(call.inline, `(${expression})`);
      assert.notEqual(call.mutation, call.inline);
    }
    for (let mutation = -1; mutation < subject.calls.length; mutation += 1) {
      const program = inlineProgram(subject, mutation);
      assert.doesNotMatch(
        program.slice(frontmatter.length),
        /\beval\(/u,
        "no eval call remains",
      );
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileSource(
          babelFrontend,
          { source: program, sourceId: subject.path },
          { specialization, test262Host: true },
        );
        assert.deepEqual(compiled.diagnostics, []);
      }
    }
  });
}

for (const fixture of inlineFixtures) {
  test(
    `${fixture.name} observes its inline witness with forced GC`,
    { skip },
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
            { specialization, observeSpecialization: true, test262Host: true },
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
              target: nativeTarget!,
              toolchain: nativeToolchain,
            },
            (native) => {
              assertMatchingObservations([expected, native]);
              assert.ok(native.counters != null);
              assert.ok(native.counters.collections > 0);
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
