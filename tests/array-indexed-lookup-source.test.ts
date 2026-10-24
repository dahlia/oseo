import assert from "node:assert/strict";
import test from "node:test";

import { cBackend } from "../packages/backend-c/src/index.ts";
import { compileSource } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { arrayIndexedLookupCase } from "./array-indexed-lookup-cases.ts";

test("array indexed lookup transition model matches the reference", () => {
  for (const items of [[], [-3, 0, 4, 9], [-20, 20], [0, 0, 0, 0]]) {
    const { source, stdout } = arrayIndexedLookupCase(items, 7);
    const lines: string[] = [];
    // Only the bootstrap reference executes JavaScript here. The native
    // fixture and existing generated family execute Oseo in their own lanes.
    const observe = new Function("console", source);
    observe({
      log: (...values: readonly unknown[]) => {
        lines.push(values.map(String).join(" "));
      },
    });
    assert.equal(`${lines.join("\n")}\n`, stdout);
  }
});

test("array indexed lookup regressions lower under both policies", () => {
  const { source } = arrayIndexedLookupCase([-3, 0, 4, 9], 7);
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId: "array-indexed-lookup-transitions.js" },
      { specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const emitted = cBackend.emit(compiled.mir);
    assert.match(emitted.source, /oseo_object_get/u);
  }
});
