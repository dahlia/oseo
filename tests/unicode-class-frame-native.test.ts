/* eslint-disable no-await-in-loop -- Native variants execute in order. */

import assert from "node:assert/strict";
import test from "node:test";

import { cBackend } from "../packages/backend-c/src/index.ts";
import {
  compileSource,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import { withNativeFixture } from "../packages/testkit/src/index.ts";
import { createTest262FragmentExecutor } from "../tools/test262-fragments.ts";
import { parseTest262Case } from "../tools/test262-source.ts";
import { executeTest262Case } from "../tools/test262.ts";
import { readFile } from "node:fs/promises";
import {
  loadUnicodeClassSource,
  unicodeClassSubjects,
} from "./helpers/unicode-class-subjects.ts";
import { runNativeCli } from "./native-cli.ts";
import { nativeToolchain } from "./native-toolchain.ts";
const { privateNameLifetimeFixtures } =
  await import("./native/fixtures/class-private-name-lifetimes.ts");

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const fragments = createTest262FragmentExecutor(host, nativeToolchain);
const base = await readFile(
  new URL("test262/harness/base.js", import.meta.url),
  "utf8",
);

test(
  "fixed private-name lifetimes survive forced collection and guard misses",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    assert.ok(nativeTarget);
    const fixture = privateNameLifetimeFixtures[0]!;
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source: fixture.source, sourceId: "private-name-lifetimes.js" },
        { observeSpecialization: true, specialization },
      );
      assert.deepEqual(compiled.diagnostics, []);
      assert.ok(compiled.mir);
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
            assert.equal(native.exitStatus, 0, native.stderr);
            assert.equal(native.stderr, "");
            assert.equal(
              native.stdout,
              "2 3 4\ntrue false\nbrand true\n" +
                "9 10 11\ntrue false\nbrand true\n" +
                "-4 -3 -2\ntrue false\nbrand true\n4 false1\n",
            );
            assert.ok(native.counters);
            assert.ok(native.counters.collections > 0);
            if (specialization === "enabled") {
              assert.ok(native.counters.guardHits > 0);
              assert.ok(native.counters.guardMisses > 0);
            }
          },
        );
      } finally {
        delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      }
    }
  },
);

for (const subject of unicodeClassSubjects) {
  test(
    `complete Unicode private-class source: ${subject.name}`,
    { skip: nativeTarget == null ? "requires a supported native host" : false },
    async () => {
      assert.ok(nativeTarget);
      const source = await loadUnicodeClassSource(subject);
      const sourceId = `test/language/identifiers/${subject.name}`;
      const parsed = parseTest262Case(
        source,
        sourceId,
        "f2d1435644797268dca1f7988cad5a4e89ccd8d2",
      );
      const result = await executeTest262Case(
        source,
        parsed,
        new Set(["class", "class-fields-private"]),
        { base, done: "", includes: new Map() },
        {
          target: nativeTarget.name,
          async execute(request) {
            const native = await fragments.execute(request, () =>
              runNativeCli(
                {
                  args: [
                    "--target",
                    nativeTarget.name,
                    ...(request.specialization === "disabled"
                      ? ["--no-specialization"]
                      : []),
                    request.sourceId,
                  ],
                  source: request.source,
                  sourceId: request.sourceId,
                  version: "0.1.0",
                },
                host,
              ),
            );
            assert.equal(native.executed, true, native.stderr);
            assert.equal(native.exitStatus, 0, native.stderr);
            assert.equal(native.stdout, "");
            assert.equal(native.stderr, "");
            return native;
          },
        },
        ["classes"],
      );
      assert.equal(result.classification, "pass", result.observation.detail);
      assert.deepEqual(
        result.execution?.variants
          .map((variant) => `${variant.strictness}/${variant.specialization}`)
          .toSorted(),
        [
          "non-strict/disabled",
          "non-strict/enabled",
          "strict/disabled",
          "strict/enabled",
        ],
      );
    },
  );
}
