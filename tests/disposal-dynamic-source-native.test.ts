/* eslint-disable no-await-in-loop -- Native builds run serially. */

/*
 * Replacement evidence for the seven explicit resource management rows
 * that stop at ADR 0016: three proto-from-ctor-realm rows and
 * SuppressedError/newtarget-proto-fallback.js, which build NewTarget
 * with the Function constructor, and three using and await using rows
 * that call eval. The fixture keeps each original assertion and replaces
 * only the source-compiling call with a literal function or a literal
 * ADR 0029 host Script. The exclusion audit binds this file and the
 * fixture by digest.
 */

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
const base = await readFile(
  new URL("./test262/harness/base.js", import.meta.url),
  "utf8",
);
const source =
  base +
  "\n" +
  (await readFile(
    new URL(
      "./fixtures/disposal-dynamic-source/witnesses.js.txt",
      import.meta.url,
    ),
    "utf8",
  ));
const expected = {
  exitStatus: 0,
  stderr: "",
  stdout: "disposal dynamic source complete\n",
};

/**
 * The literal host Scripts the witness must link, in source order. The
 * last two are the eval-goal early errors, which compile to a SyntaxError
 * thrown when the Script is evaluated.
 */
const hostScripts: readonly (readonly [string, string | undefined])[] = [
  ["(function(){})", undefined],
  ["(function(){})", undefined],
  ["(function(){})", undefined],
  ["{using test262id1 = null;}", undefined],
  ["{using test262id2 = null, test262id3 = null;}", undefined],
  ["4; {using test262id5 = null;}", undefined],
  ["6; {using test262id7 = null, test262id8 = null;}", undefined],
  ["using x = null;", "syntax"],
  ["await using x = null;", "syntax"],
];

test("disposal dynamic source structure", () => {
  // A deferred compilation would make this a boundary test rather than a
  // non-source witness, so every Script body is in the linked table, and
  // only the two early-error Scripts lack a function.
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId: "disposal-dynamic-source.js" },
      { specialization, test262Host: true },
    );
    assert.deepEqual(compiled.diagnostics, []);
    const scripts = compiled.mir!.test262Host!.scripts!;
    // Identical literals share one table entry.
    const unique = [
      ...new Map(hostScripts.map(([text, error]) => [text, error])),
    ];
    assert.deepEqual(
      scripts.map((script) => [script.source, script.error]),
      unique,
    );
    for (const script of scripts) {
      assert.equal(
        script.error == null,
        compiled.mir!.functions.some(
          (fn) => fn.id === script.functionId && fn.hostScript != null,
        ),
      );
    }
  }
});

test("disposal dynamic source reference", async () => {
  for (const reference of await hostScriptReferences(host, source)) {
    assertMatchingObservations([expected, reference]);
  }
});

test(
  "disposal dynamic source native",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    const saved = process.env.OSEO_GC_EVERY_SAFEPOINT;
    process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
    try {
      for (const specialization of ["disabled", "enabled"] as const) {
        const compiled = compileSource(
          babelFrontend,
          { source, sourceId: "disposal-dynamic-source.js" },
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
