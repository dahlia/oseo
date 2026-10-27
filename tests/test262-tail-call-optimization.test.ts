import assert from "node:assert/strict";
import test from "node:test";

import type { CliResult } from "../packages/cli/src/index.ts";
import { targetForExecutionHost } from "../packages/compiler/src/index.ts";
import { createDenoHost, createNodeHost } from "../packages/host/src/index.ts";
import { createTest262FragmentExecutor } from "../tools/test262-fragments.ts";
import { executeTest262Case } from "../tools/test262.ts";
import { loadTcoAdmission } from "./helpers/tco-feature-admission.ts";
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
const admission = await loadTcoAdmission();
const fragments = createTest262FragmentExecutor(host, nativeToolchain);

for (const subject of admission.subjects) {
  test(
    `original test262 TCO subject: ${subject.entry.path}`,
    { skip: nativeTarget == null ? "requires a supported native host" : false },
    async () => {
      assert.ok(nativeTarget != null);
      const observed: CliResult[] = [];
      const result = await executeTest262Case(
        subject.source,
        subject.parsed,
        new Set(admission.subset.supportedFeatures),
        admission.harnesses,
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
            observed.push(native);
            return native;
          },
        },
        subject.entry.dependencies,
        { rootPath: admission.rootPath, sourcePath: subject.sourcePath },
      );
      assert.equal(result.classification, "pass", result.observation.detail);
      assert.deepEqual(result.unsupportedFeatures, []);
      assert.equal(result.execution?.target, nativeTarget.name);
      assert.deepEqual(result.execution?.harnessIncludes, [
        "base.js",
        "tcoHelper.js",
      ]);
      assert.deepEqual(
        result.execution?.variants
          .map((variant) => `${variant.strictness}/${variant.specialization}`)
          .toSorted(),
        ["strict/disabled", "strict/enabled"],
      );
      assert.equal(observed.length, 2);
      for (const native of observed) {
        assert.equal(native.executed, true);
        assert.equal(native.exitStatus, 0, native.stderr);
        assert.equal(native.stdout, "");
        assert.equal(native.stderr, "");
      }
    },
  );
}
