/* eslint-disable no-await-in-loop -- Native observations are isolated. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  compileSource,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { createDenoHost, createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../packages/testkit/src/index.ts";
import { createTest262FragmentExecutor } from "../tools/test262-fragments.ts";
import {
  parseReviewedSubset,
  parseTest262Case,
} from "../tools/test262-source.ts";
import { executeTest262Case } from "../tools/test262.ts";
import { balancedInteropBackend } from "./helpers/balanced-backend.ts";
import {
  delegatedThrowBoundaries,
  delegatedThrowExpected,
  delegatedThrowSource,
} from "./helpers/yield-star-throw.ts";
import { runNativeCli } from "./native-cli.ts";
import { nativeToolchain } from "./native-toolchain.ts";

const host =
  Object.getOwnPropertyDescriptor(globalThis, "Deno")?.value == null
    ? createNodeHost()
    : createDenoHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/** Assert roots and native charges through the existing balanced backend. */
async function observe(source: string, stdout: string) {
  assert.ok(nativeTarget != null);
  const expected = { exitStatus: 0, stderr: "", stdout };
  for (const [command, args] of [
    ["node", ["--eval", source]],
    ["deno", ["eval", source]],
  ] as const) {
    assertMatchingObservations([
      expected,
      await host.run({ command, args, cwd: process.cwd() }),
    ]);
  }
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId: "yield-star-throw.js" },
      { specialization, observeSpecialization: true },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const previous = process.env.OSEO_GC_EVERY_SAFEPOINT;
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      await withNativeFixture(
        {
          backend: balancedInteropBackend,
          host,
          input: compiled.mir,
          operation: "execute",
          runtime: cRuntimeProvider,
          target: nativeTarget,
          toolchain: nativeToolchain,
        },
        (native) => {
          assertMatchingObservations([expected, native]);
          assert.ok(native.counters != null);
          assert.ok(native.counters.allocations > 0);
          assert.ok(native.counters.collections > 0);
        },
      );
    } finally {
      if (previous == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      else process.env.OSEO_GC_EVERY_SAFEPOINT = previous;
    }
  }
}

test(
  "original noncallable throw counterexample bypasses iterator close",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const source = await readFile(
      new URL(
        "./native/fixtures/yield-star-noncallable-throw.js.txt",
        import.meta.url,
      ),
      "utf8",
    );
    assert.equal(
      createHash("sha256").update(source).digest("hex"),
      "db54af4f8c0803797b34f8b1b2e3bb60f4abc4e0353f6dacf0f888dca60eca86",
    );
    await observe(
      source,
      "normal TypeError 0\ngetter-throw TypeError 0\nprimitive TypeError 0\n",
    );
  },
);

test(
  "delegated throw preserves every coupled GetMethod and close boundary",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await observe(
      delegatedThrowSource(delegatedThrowBoundaries),
      delegatedThrowExpected(delegatedThrowBoundaries),
    );
  },
);

/** Original pinned B16 subjects; their earlier passes are not new failures. */
const yieldPath = "test/language/expressions/yield/";
const originalSubjects = [
  {
    path: yieldPath + "star-rhs-iter-thrw-res-done-err.js",
    sha256: "e366419f27f18bd89ec96205c42537864527227f666c8d1c665296d3295c78c9",
  },
  {
    path: yieldPath + "star-rhs-iter-thrw-res-done-no-value.js",
    sha256: "ae694e4aa011dd0e97a98e437df07d4424104b2d69d829c2352c3a3e9d244136",
  },
  {
    path: yieldPath + "star-rhs-iter-thrw-res-value-err.js",
    sha256: "a299ffc0586854ca19ee56652e63fd1f7fa7cb0338fd6f12f62e41ef3313fb4c",
  },
  {
    path: yieldPath + "star-rhs-iter-thrw-res-value-final.js",
    sha256: "d4aa922689bd90941aa2188fbfb2e5a553e8b09feab7db7933be32cd5014e59c",
  },
  {
    path: yieldPath + "star-rhs-iter-thrw-thrw-call-err.js",
    sha256: "25bfffe975b885b7d79563cd99c0190828fd4f25a0d71fe83bf896c0cbd2e8e8",
  },
  {
    path: yieldPath + "star-rhs-iter-thrw-thrw-call-non-obj.js",
    sha256: "2bbdc612d659a339fda606c450e91b7318d26a27cdc1f512e3f9c32a09be1e3e",
  },
  {
    path: yieldPath + "star-rhs-iter-thrw-thrw-get-err.js",
    sha256: "56874af67e6e091beecdd4af7c6773f1e3270e5d83ffa737f0d1adae719f4db6",
  },
  {
    path: yieldPath + "star-rhs-iter-thrw-thrw-invoke.js",
    sha256: "66dca99d292be8fec5831de23889a9f16ac3004afac3894f73203e8899763277",
  },
  {
    path: yieldPath + "star-rhs-iter-thrw-violation-no-rtrn.js",
    sha256: "f06619ced4ced1dcf009e54d62a8f3b790975b684644dbc4d340ab9b0d630beb",
  },
  {
    path: yieldPath + "star-rhs-iter-thrw-violation-rtrn-call-err.js",
    sha256: "c4d17d12ac7c5107588bb288ed3689860e805b2f6582ff6eb5fe2a20276403e9",
  },
  {
    path: yieldPath + "star-rhs-iter-thrw-violation-rtrn-call-non-obj.js",
    sha256: "81b3ba049035085433218e70c805a5f7ff87e7e2cfc6a0b314df77b1e4b80cc9",
  },
  {
    path: yieldPath + "star-rhs-iter-thrw-violation-rtrn-get-err.js",
    sha256: "89cf10e32fd7d2918b971b6e71af2301b466424ff558df67ab9ed37a1324cc6d",
  },
  {
    path: yieldPath + "star-rhs-iter-thrw-violation-rtrn-invoke.js",
    sha256: "e98931bd7d7e954bcf9945fb2eed9e17b449ad35221f7c4a82c10aad04fdf44f",
  },
  {
    path: yieldPath + "star-throw-is-null.js",
    sha256: "ecce495fd8640f9fe070d83398171167e00008ecd474067e6241e77b46430eff",
  },
] as const;

test(
  "fourteen original B16 throw subjects retain their complete assertions",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    assert.ok(nativeTarget != null);
    const subset = parseReviewedSubset(
      await readFile(new URL("./test262/subset.yaml", import.meta.url), "utf8"),
    );
    assert.equal(
      subset.suiteRevision,
      "f2d1435644797268dca1f7988cad5a4e89ccd8d2",
    );
    const base = await readFile(
      new URL("./test262/harness/base.js", import.meta.url),
      "utf8",
    );
    const rootPath = dirname(
      fileURLToPath(import.meta.resolve("test262/package.json")),
    );
    const fragments = createTest262FragmentExecutor(host, nativeToolchain);
    for (const subject of originalSubjects) {
      const sourcePath = join(rootPath, subject.path);
      const source = await readFile(sourcePath, "utf8");
      assert.equal(
        createHash("sha256").update(source).digest("hex"),
        subject.sha256,
      );
      const parsed = parseTest262Case(
        source,
        subject.path,
        subset.suiteRevision,
      );
      assert.deepEqual(parsed.case.includes, []);
      const result = await executeTest262Case(
        source,
        parsed,
        new Set(subset.supportedFeatures),
        { base, done: "", includes: new Map() },
        {
          target: nativeTarget.name,
          execute(request) {
            return fragments.execute(request, () =>
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
          },
        },
        subset.tests.find((entry) => entry.path === subject.path)?.dependencies,
        { rootPath, sourcePath },
      );
      assert.equal(result.classification, "pass", result.observation.detail);
      assert.equal(result.execution?.variants.length, 4);
    }
  },
);
