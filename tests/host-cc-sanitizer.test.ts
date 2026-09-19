import { runNativeFixture } from "../tools/native-fixture.ts";
/* eslint-disable no-await-in-loop -- Each probe owns an isolated build. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { describeTarget } from "../packages/compiler/src/index.ts";

import { nativeToolchain } from "./native-toolchain.ts";

const hostTarget =
  process.platform === "linux" && process.arch === "x64"
    ? "linux-x86_64-gnu"
    : process.platform === "darwin" && process.arch === "arm64"
      ? "macos-aarch64"
      : undefined;
const target = describeTarget(hostTarget ?? "linux-x86_64-gnu");
const probes = {
  address: {
    source: `#include <stdlib.h>
int probe(int index) {
  void *(*volatile allocate)(size_t) = malloc;
  volatile int *values = allocate(sizeof(int));
  if (values == NULL) return 2;
  values[index] = 42;
  free((void *)values);
  return 0;
}
`,
    report: /AddressSanitizer: heap-buffer-overflow/u,
  },
  undefined: {
    source: `#include <limits.h>
int probe(int increment) {
  volatile int value = INT_MAX;
  volatile int result = value + increment;
  (void)result;
  return 0;
}
`,
    report: /signed integer overflow: (?:2147483647 \+ 1|1 \+ 2147483647)\b/u,
  },
} as const;

for (const sanitizer of target.sanitizers) {
  for (const location of ["runtime", "generated"] as const) {
    test(
      `${target.name} reports ${sanitizer} in ${location} code`,
      {
        skip:
          process.env.OSEO_NATIVE_TOOLCHAIN !== "host-cc" || hostTarget == null
            ? "requires a supported native host"
            : false,
      },
      async () => {
        const directory = await mkdtemp(join(tmpdir(), "oseo-sanitizer-"));
        try {
          const probe = probes[sanitizer];
          const runtime = join(directory, "runtime.c");
          const generated = join(directory, "generated.c");
          const main =
            "int main(int argc, char **argv) {\n" +
            "  (void)argv; return probe(argc);\n}\n";
          await writeFile(
            runtime,
            location === "runtime"
              ? probe.source
              : "int anchor(void) { return 0; }\n",
          );
          await writeFile(
            generated,
            (location === "generated" ? probe.source : "int probe(int);\n") +
              main,
          );
          const plan = nativeToolchain.createBuildPlan({
            generatedSourcePath: generated,
            runtimeDirectory: directory,
            runtimeSourcePaths: [runtime],
            target,
            workingDirectory: directory,
          });
          const environment = Object.fromEntries(
            (nativeToolchain.environment?.inherit ?? []).flatMap((name) => {
              const value = process.env[name];
              return value == null ? [] : [[name, value]];
            }),
          );
          for (const request of plan.requests) {
            const built = spawnSync(request.command, request.args, {
              cwd: request.cwd,
              encoding: "utf8",
              env: environment,
              timeout: 120_000,
            });
            assert.ifError(built.error);
            assert.equal(built.status, 0, built.stderr);
          }
          const observed = runNativeFixture(plan.executablePath, [], {
            encoding: "utf8",
            env: environment,
            timeout: 30_000,
          });
          assert.ifError(observed.error);
          assert.match(observed.stderr, probe.report);
          if (sanitizer === "address") assert.notEqual(observed.status, 0);
        } finally {
          await rm(directory, { force: true, recursive: true });
        }
      },
    );
  }
}
