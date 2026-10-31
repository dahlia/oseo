/* eslint-disable no-await-in-loop -- Native builds are isolated. */
import assert from "node:assert/strict";
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
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../packages/testkit/src/index.ts";
import { hostScriptReferences } from "./native/host-script-reference.ts";
import { nativeToolchain } from "./native-toolchain.ts";

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(host.executionHost!);
const groups = [
  "array",
  "bound",
  "buffers",
  "call-this-apply",
  "class-call",
  "derived-return",
  "derived-this",
  "collections-errors",
  "date",
  "generator-prototypes",
  "function-creation",
  "native-errors",
  "primitive-reference",
  "private-brands",
  "proxy",
  "regexp",
  "super",
  "template",
  "throw-type-error",
  "typedarray-bigint",
  "typedarray-number",
  "weak",
  "wrappers",
] as const;
const base = await readFile(
  new URL("./test262/harness/base.js", import.meta.url),
  "utf8",
);
const fixtures = await Promise.all(
  groups.map(async (name) => ({
    name,
    source:
      base +
      "\n" +
      (await readFile(
        new URL(`./fixtures/ds19-realm/${name}.js.txt`, import.meta.url),
        "utf8",
      )),
  })),
);

for (const fixture of fixtures) {
  test(`DS19 structure: ${fixture.name}`, () => {
    // Every foreign body must be in the finite linked Script table. A failed
    // deferred compilation would make this a boundary test rather than a
    // non-source witness. Both policies must retain the same source set.
    const sources: string[][] = [];
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source: fixture.source, sourceId: `ds19-${fixture.name}.js` },
        { specialization, test262Host: true },
      );
      assert.deepEqual(compiled.diagnostics, []);
      const scripts = compiled.mir!.test262Host!.scripts!;
      assert.ok(scripts.length > 0);
      for (const script of scripts) {
        assert.equal(script.error, undefined);
        assert.ok(
          compiled.mir!.functions.some(
            (fn) => fn.id === script.functionId && fn.hostScript != null,
          ),
        );
      }
      sources.push(scripts.map((script) => script.source));
    }
    assert.deepEqual(sources[0], sources[1]);
  });

  test(`DS19 reference: ${fixture.name}`, async () => {
    const expected = {
      exitStatus: 0,
      stderr: "",
      stdout: `DS19 ${fixture.name} complete\n`,
    };
    // Both reference engines allocate the uninitialized-this ReferenceError
    // in the callee realm. Keep that difference out of the native oracle.
    const referenceSource =
      fixture.name === "derived-this"
        ? base +
          "\n" +
          (await readFile(
            new URL(
              "./fixtures/ds19-realm/derived-this-reference.js.txt",
              import.meta.url,
            ),
            "utf8",
          ))
        : fixture.source;
    for (const reference of await hostScriptReferences(host, referenceSource)) {
      assertMatchingObservations([expected, reference]);
    }
  });

  test(
    `DS19 native: ${fixture.name}`,
    { skip: nativeTarget == null ? "requires a supported native host" : false },
    async () => {
      const expected = {
        exitStatus: 0,
        stderr: "",
        stdout: `DS19 ${fixture.name} complete\n`,
      };
      const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
      process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
      try {
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source: fixture.source, sourceId: `ds19-${fixture.name}.js` },
            { specialization, observeSpecialization: true, test262Host: true },
          );
          assert.deepEqual(compiled.diagnostics, []);
          await withNativeFixture(
            {
              backend: cBackend,
              host,
              input: compiled.mir!,
              operation: "execute",
              runtime: cRuntimeProvider,
              target: nativeTarget!,
              toolchain: nativeToolchain,
            },
            (native) => {
              assertMatchingObservations([expected, native]);
              // The forcing list and the positive-collection list are the same
              // complete group set, in both policies; no group can omit either.
              assert.ok(native.counters!.collections > 0);
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
