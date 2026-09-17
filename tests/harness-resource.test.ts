/* eslint-disable no-await-in-loop -- Native measurements are serial. */
import assert from "node:assert/strict";
import test from "node:test";
import {
  cBackend,
  emitScriptFragments,
} from "../packages/backend-c/src/index.ts";
import {
  compileSource,
  compileHarnessFragment,
  compileBodyFragment,
  targetForExecutionHost,
} from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../packages/runtime-c/src/index.ts";
import { nativeToolchain, hostCcLane } from "./native-toolchain.ts";

// Compiler intrinsics observe actual native frames even under ASan fake-stack
// instrumentation. This probe is separate from unmodified-output equivalence.
const probe = `#include "oseo_runtime.h"
#include <inttypes.h>
#include <stdio.h>
static uintptr_t entry_frame;
void oseo_probe_context_init(OseoContext *context,
    const char *source, size_t length) {
    entry_frame = (uintptr_t)__builtin_frame_address(0);
    oseo_context_init(context, source, length);
}
OseoResult oseo_probe_console_log(OseoContext *context,
    size_t count, const OseoValue *values) {
    uintptr_t current = (uintptr_t)__builtin_frame_address(0);
    uintptr_t depth = entry_frame > current
        ? entry_frame - current : current - entry_frame;
    fprintf(stderr, "slots=%zu stack=%" PRIuPTR "\\n",
        context->active_frame_slots, depth);
    return oseo_console_log(context, count, values);
}
`;
const instrument = `#define oseo_context_init oseo_probe_context_init
#define oseo_console_log oseo_probe_console_log
`;

const nativeTarget = targetForExecutionHost(
  createNodeHost().executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

test(
  "measure split entry frame resource costs",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const host = createNodeHost();
    const work = await host.makeTemporaryDirectory("oseo-frame-probe-");
    try {
      const environment = (await host.captureEnvironment!(
        nativeToolchain.environment!,
      )) ?? { variables: {} };
      const target = nativeTarget!;
      const paths: string[] = [];
      for (const asset of cRuntimeProvider.getRuntimeInput().assets) {
        await host.writeTextFile(
          `${work}/${asset.name}`,
          await host.readTextFile(asset.url),
        );
        if (asset.kind === "source") paths.push(`${work}/${asset.name}`);
      }
      const sources = [
        { sourceId: "h.js", source: "function f() { console.log(42); }" },
      ];
      const h = compileHarnessFragment(babelFrontend, sources);
      assert.equal(h.kind, "compiled");
      if (h.kind !== "compiled") return;
      const b = compileBodyFragment(babelFrontend, h.harness, {
        sourceId: "case.js",
        source: "f();",
      });
      assert.equal(b.kind, "compiled");
      if (b.kind !== "compiled") return;
      const units = emitScriptFragments(h.harness, b.body, {
        sourceId: "case.js",
        harnessLineOffset: 0,
        bodyLineOffset: 1,
      });
      const whole = compileSource(babelFrontend, {
        sourceId: "case.js",
        source: sources[0]!.source + "\nf();",
      });
      assert.ok(whole.mir);
      for (const unit of Object.values(units)) {
        await host.writeTextFile(
          `${work}/${unit.sourceName}`,
          instrument + unit.source,
        );
      }
      await host.writeTextFile(
        `${work}/whole.c`,
        instrument + cBackend.emit(whole.mir).source,
      );
      await host.writeTextFile(`${work}/probe.c`, probe);
      const object = await host.run(
        nativeToolchain.harnessObjectReuse!.createBuildRequest({
          workingDirectory: work,
          target,
          environment,
        }),
      );
      assert.equal(object.exitStatus, 0, object.stderr);
      let archive: string | undefined;
      const measurements: Record<string, string> = {};
      for (const split of [false, true]) {
        const input = {
          environment,
          target,
          workingDirectory: work,
          runtimeDirectory: work,
          generatedSourcePath: `${work}/${split ? "launcher" : "whole"}.c`,
          additionalGeneratedSourcePaths: [
            `${work}/probe.c`,
            ...(split ? [`${work}/case.c`] : []),
          ],
          prebuiltObjectPaths: split ? [`${work}/harness.o`] : [],
        };
        const plan = nativeToolchain.createBuildPlan(
          archive == null
            ? { ...input, runtimeSourcePaths: paths }
            : {
                ...input,
                runtimeSourcePaths: [],
                prebuiltRuntimeArchivePath: archive,
              },
        );
        for (const request of plan.requests) {
          const result = await host.run(request);
          assert.equal(result.exitStatus, 0, result.stderr);
        }
        archive ??= plan.runtimeArchivePath;
        const result = await host.run({
          command: plan.executablePath,
          args: [],
          cwd: work,
          environment: { variables: {} },
        });
        assert.equal(result.exitStatus, 0, result.stderr);
        assert.equal(result.stdout, "42\n");
        assert.match(result.stderr, /^slots=\d+ stack=\d+\n$/u);
        measurements[split ? "split" : "whole"] = result.stderr.trim();
      }
      console.log(
        JSON.stringify({
          adapter: hostCcLane ? "host-cc" : "zig",
          measured: true,
          frameProbe: measurements,
        }),
      );
    } finally {
      await host.remove(work);
    }
  },
);
