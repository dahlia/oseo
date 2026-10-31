/* eslint-disable no-await-in-loop -- Native fixtures isolate global realms. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../packages/testkit/src/index.ts";
import * as cases from "./native/fixtures/completion-record-cases.ts";
const { completionRecordCases } = cases;
import * as records from "./native/fixtures/completion-records.ts";
const { completionRecordFixtures, completionRecordOracleFixture } = records;
import { hostScriptReferences } from "./native/host-script-reference.ts";
import { nativeToolchain } from "./native-toolchain.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);
const skip = nativeTarget == null ? "requires a supported native host" : false;

function expectedOutput(group: number): string {
  return completionRecordCases
    .slice(group, group + 1)
    .flatMap((subject, index) =>
      (subject.strict ? [false, true] : [false]).map(
        (strict) =>
          `${subject.path} ${index}_${strict ? "strict" : "sloppy"}\n`,
      ),
    )
    .join("");
}

test("completion selector retains all 81 distinct original subjects", () => {
  const selected = readFileSync(
    new URL(
      "../docs/m5c-graph/dynamic-source-completion-record-evidence.paths.txt",
      import.meta.url,
    ),
    "utf8",
  )
    .trim()
    .split("\n");
  assert.deepEqual(
    completionRecordCases.map((subject) => subject.path),
    selected,
  );
  assert.equal(new Set(selected).size, 81);
});

for (let group = 0; group < 15; group += 1) {
  const first = group * 6;
  const fixtures =
    group === 14
      ? [completionRecordOracleFixture]
      : completionRecordFixtures.slice(first, first + 6);
  test(`completion structure and references: ${group}`, async () => {
    for (const [offset, fixture] of fixtures.entries()) {
      const expected = {
        exitStatus: 0,
        stderr: "",
        stdout:
          group === 14
            ? "strict-completion-oracle\n"
            : expectedOutput(first + offset),
      };
      assertMatchingObservations([
        expected,
        ...(await hostScriptReferences(host, fixture.source)),
      ]);
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileSource(
          babelFrontend,
          {
            source: fixture.source,
            sourceId: fixture.name + ".js",
          },
          { specialization, test262Host: true },
        );
        assert.deepEqual(compiled.diagnostics, []);
        assert.ok(compiled.mir != null);
        const scripts = compiled.mir.test262Host!.scripts;
        assert.ok(scripts != null && scripts.length > 1);
        assert.ok(scripts.every((script) => script.error == null));
        const mir = printMir(compiled.mir);
        assert.match(mir, /Script completion/u);
        const emitted = cBackend.emit(compiled.mir);
        assert.match(emitted.source, /oseo_test262_host_install/u);
        assert.match(emitted.source, /oseo_host_scripts/u);
      }
    }
  });
  test(`completion native: ${group}`, { skip }, async () => {
    const originalGc = process.env.OSEO_GC_EVERY_SAFEPOINT;
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      for (const [offset, fixture] of fixtures.entries()) {
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            {
              source: fixture.source,
              sourceId: fixture.name + ".js",
            },
            {
              observeSpecialization: true,
              specialization,
              test262Host: true,
            },
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
              assertMatchingObservations([
                {
                  exitStatus: 0,
                  stderr: "",
                  stdout:
                    group === 14
                      ? "strict-completion-oracle\n"
                      : expectedOutput(first + offset),
                },
                native,
              ]);
              assert.ok(native.counters!.collections > 0);
            },
          );
        }
      }
    } finally {
      if (originalGc == null) delete process.env.OSEO_GC_EVERY_SAFEPOINT;
      else process.env.OSEO_GC_EVERY_SAFEPOINT = originalGc;
    }
  });
}
