/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import { readFile } from "node:fs/promises";
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
import { runNativeCli } from "./native-cli.ts";
import * as evalFixture from "./native/fixtures/direct-eval-non-string.ts";
import { nativeToolchain } from "./native-toolchain.ts";
import {
  parseReviewedSubset,
  parseTest262Case,
} from "../tools/test262-source.ts";
import { executeTest262Case } from "../tools/test262.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

test(
  "direct eval preserves identity and ordinary binding/argument semantics",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    assert.ok(nativeTarget != null);
    const { source } = evalFixture.directEvalNonStringFixture;
    const references = await Promise.all([
      host.run({
        args: ["-e", source],
        command: "node",
        cwd: process.cwd(),
      }),
      host.run({ args: ["eval", source], command: "deno", cwd: process.cwd() }),
    ]);
    for (const reference of references) {
      assert.equal(reference.exitStatus, 0, reference.stderr);
      assert.equal(reference.stdout, references[0]?.stdout);
    }
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        {
          source,
          sourceId: "direct-eval-identity.js",
        },
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
            target: nativeTarget,
            toolchain: nativeToolchain,
          },
          (native) => {
            assert.equal(native.exitStatus, 0, native.stderr);
            assert.equal(native.stdout, references[0]?.stdout);
            assert.ok(native.counters != null);
            assert.ok(native.counters.collections > 0);
            if (specialization === "enabled") {
              assert.ok(native.counters.guardHits > 0);
              assert.ok(native.counters.guardMisses > 0);
              assert.ok(native.counters.genericAdditionCalls > 0);
            } else {
              assert.equal(native.counters.guardHits, 0);
              assert.equal(native.counters.guardMisses, 0);
            }
          },
        );
      } finally {
        delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      }
    }
  },
);

test(
  "direct String eval keeps the located ADR 0016 runtime boundary",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    for (const expression of [
      'eval("console.log(99)")',
      'eval((console.log("argument"), "console.log(99)"), ' +
        'console.log("extra"))',
      '((value) => eval(value))("console.log(99)")',
      'eval(...["console.log(99)"])',
    ]) {
      for (const specialization of ["disabled", "enabled"] as const) {
        const result = await runNativeCli(
          {
            args: [
              ...(specialization === "disabled" ? ["--no-specialization"] : []),
              "eval-boundary.js",
            ],
            source: `console.log("before");\n${expression};\n`,
            sourceId: "eval-boundary.js",
            version: "0.1.0",
          },
          host,
        );
        assert.equal(result.exitStatus, 1);
        assert.equal(
          result.stdout,
          expression.includes('console.log("argument")')
            ? "before\nargument\nextra\n"
            : "before\n",
        );
        assert.match(result.stderr, /eval-boundary\.js:2:/u);
        assert.match(result.stderr, /error\[OSEO1001\]: eval compiles/u);
      }
    }
  },
);

test(
  "both original non-String direct eval paths pass every variant",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    assert.ok(nativeTarget != null);
    const subset = parseReviewedSubset(
      await readFile(new URL("./test262/subset.yaml", import.meta.url), "utf8"),
    );
    const base = await readFile(
      new URL("./test262/harness/base.js", import.meta.url),
      "utf8",
    );
    for (const name of ["non-string-object", "non-string-primitive"]) {
      const path = `test/language/eval-code/direct/${name}.js`;
      const source = await readFile(
        new URL(import.meta.resolve(`test262/${path}`)),
        "utf8",
      );
      const entry = subset.tests.find((item) => item.path === path);
      assert.ok(entry);
      let executed = 0;
      const result = await executeTest262Case(
        source,
        parseTest262Case(source, path, subset.suiteRevision),
        new Set(subset.supportedFeatures),
        { base, done: "", includes: new Map() },
        {
          target: nativeTarget.name,
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
            executed = executed + 1;
            return native;
          },
        },
        entry.dependencies,
      );
      assert.equal(result.classification, "pass", result.observation.detail);
      assert.equal(executed, 4);
      assert.equal(result.execution?.variants.length, 4);
    }
  },
);
