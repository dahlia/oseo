/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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
import { withNativeFixture } from "../packages/testkit/src/index.ts";
import { executeTest262Case } from "../tools/test262.ts";
import { parseTest262Case } from "../tools/test262-source.ts";
import { loadTcoAdmission } from "./helpers/tco-feature-admission.ts";
import { properTailCallFixtures } from "./native/fixtures/proper-tail-calls.ts";
import { nativeToolchain } from "./native-toolchain.ts";
import { runNativeCli } from "./native-cli.ts";

const host = createNodeHost();
const target = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const skip = target == null ? "requires a supported native host" : false;

test(
  "the original rebound global eval TCO subject passes",
  { skip },
  async () => {
    assert.ok(target != null);
    const admission = await loadTcoAdmission();
    const path = "test/language/expressions/call/tco-non-eval-global.js";
    const source = await readFile(
      new URL(import.meta.resolve(`test262/${path}`)),
      "utf8",
    );
    assert.equal(
      createHash("sha256").update(source).digest("hex"),
      "f94189f89e34ede682bb5745abb28cb8dd75b60e1d5011037bfbc49b737d1cce",
    );
    const entry = admission.subset.tests.find((item) => item.path === path);
    assert.ok(entry);
    const observed: string[] = [];
    const result = await executeTest262Case(
      source,
      parseTest262Case(source, path, admission.subset.suiteRevision),
      new Set(admission.subset.supportedFeatures),
      admission.harnesses,
      {
        target: target.name,
        async execute(request) {
          const native = await runNativeCli(
            {
              args: [
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
          );
          assert.equal(native.executed, true);
          assert.equal(native.exitStatus, 0, native.stderr);
          assert.equal(native.stdout, "");
          assert.equal(native.stderr, "");
          observed.push(request.specialization);
          return native;
        },
      },
      entry.dependencies,
    );
    assert.equal(result.classification, "pass", result.observation.detail);
    assert.deepEqual(observed.toSorted(), ["disabled", "enabled"]);
    assert.deepEqual(
      result.execution?.variants.map((variant) => variant.strictness),
      ["non-strict", "non-strict"],
    );
  },
);

test(
  "global eval tail calls use the ordinary current binding",
  { skip },
  async () => {
    assert.ok(target != null);
    const fixture = properTailCallFixtures.find(
      (item) => item.name === "global-eval-tail-calls",
    );
    assert.ok(fixture != null);
    const expected =
      "tail true true alive\nordinary true true\nnoncallable TypeError\n";
    const referenceSource = `(0, eval)(${JSON.stringify(fixture.source)});`;
    for (const command of ["node", "deno"]) {
      const reference = await host.run({
        args:
          command === "node"
            ? ["-e", referenceSource]
            : ["eval", referenceSource],
        command,
        cwd: process.cwd(),
      });
      assert.equal(reference.exitStatus, 0, reference.stderr);
      assert.equal(reference.stdout, expected);
      assert.equal(reference.stderr, "");
    }
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source: fixture.source, sourceId: "global-eval-tail-calls.js" },
        { observeSpecialization: true, specialization },
      );
      assert.deepEqual(compiled.diagnostics, []);
      assert.ok(compiled.mir != null);
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        await withNativeFixture(
          {
            backend: cBackend,
            host,
            input: compiled.mir,
            operation: "execute",
            runtime: cRuntimeProvider,
            target,
            toolchain: nativeToolchain,
          },
          (native) => {
            assert.equal(native.exitStatus, 0, native.stderr);
            assert.equal(native.stdout, expected);
            assert.equal(native.stderr, "");
            assert.ok(native.counters != null);
            assert.ok(native.counters.collections > 0);
          },
        );
      } finally {
        delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      }
    }
  },
);
