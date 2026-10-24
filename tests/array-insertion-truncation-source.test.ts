import assert from "node:assert/strict";
import test from "node:test";

import { cBackend } from "../packages/backend-c/src/index.ts";
import { compileSource } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { arrayInsertionTruncationCase } from "./array-mutation-cases.ts";

test("array insertion and truncation model matches the reference", () => {
  for (const items of [[], [-3, 0, 4, 9], [-20, 20], [0, 0, 0, 0]]) {
    const { source, stdout } = arrayInsertionTruncationCase(items, 7);
    const lines: string[] = [];
    const observe = new Function("console", source);
    observe({
      log: (...values: readonly unknown[]) => {
        lines.push(values.map(String).join(" "));
      },
    });
    assert.equal(`${lines.join("\n")}\n`, stdout);
  }
});

test("array insertion and truncation cases lower under both policies", () => {
  const { source } = arrayInsertionTruncationCase([-3, 0, 4, 9], 7);
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId: "array-insertion-truncation-transitions.js" },
      { specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const emitted = cBackend.emit(compiled.mir);
    assert.match(emitted.source, /oseo_object_set/u);
  }
});
