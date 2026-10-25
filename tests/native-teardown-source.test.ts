import assert from "node:assert/strict";
import test from "node:test";

import { selectBodyUnit } from "../packages/backend-c/src/bounded-body.ts";
import { cBackend } from "../packages/backend-c/src/index.ts";
import type { MirProgram } from "../packages/compiler/src/index.ts";
import {
  balancedInteropBackend,
  mapNativeSources,
} from "./helpers/balanced-backend.ts";

const teardown = "oseo_context_destroy(&context);";
const balanceCheck =
  "if (context.active_frame_slots != 0u || " +
  "context.call_depth != 0u || context.roots != NULL) abort();\n" +
  "        " +
  teardown;
const frameCheck =
  "if (context.active_frame_slots != 0u) abort();\n" +
  "        oseo_context_destroy(&context);";

/** Vary physical grouping without executing a native program or toolchain. */
function program(count: number): MirProgram {
  const range = {
    start: { column: 1, line: 1 },
    end: { column: 1, line: 1 },
  };
  return {
    kind: "mir-program",
    sourceId: "teardown-units.js",
    specialization: "disabled",
    observeSpecialization: false,
    globalBindings: [],
    globalObjectBindings: [],
    functions: [],
    script: {
      kind: "mir-function",
      id: -1,
      name: "<script>",
      parameters: [],
      parameterCount: 0,
      functionLength: 0,
      rootSlotCount: count,
      range,
      blocks: [
        {
          id: 0,
          operations: Array.from({ length: count }, (_, id) => ({
            id,
            kind: "constant" as const,
            constant: { kind: "number" as const, value: id },
            arguments: [],
            detail: String(id),
            range,
          })),
          terminator: { kind: "return", value: count - 1 },
        },
      ],
    },
  };
}

for (const count of [1, 2049, 20_000]) {
  test(`teardown assertions survive physical selection: ${count}`, () => {
    const input = program(count);
    const original = cBackend.emit(input);
    const balanced = balancedInteropBackend.emit(input);
    const accounting = mapNativeSources(original, (source) =>
      source.replaceAll(teardown, frameCheck),
    );
    assert.ok(original.source.includes(teardown));
    assert.equal(original.compilationUnits != null, count > 2048);
    if (count === 20_000) {
      assert.ok(original.compilationUnits!.length > 2);
    }
    if (count > 2048) {
      assert.match(original.source, /#if \d+u <= OSEO_MAX_ACTIVE_FRAME_SLOTS/u);
    }
    for (const [replacement, transformed] of [
      [balanceCheck, balanced],
      [frameCheck, accounting],
    ] as const) {
      assert.deepEqual(Object.keys(transformed), Object.keys(original));
      assert.equal(transformed.sourceName, original.sourceName);
      assert.equal(
        transformed.source,
        original.source.replaceAll(teardown, replacement),
      );
      assert.equal(
        transformed.compilationUnits?.length,
        original.compilationUnits?.length,
      );
      for (const [unit, physical] of (
        original.compilationUnits ?? []
      ).entries()) {
        const actual = transformed.compilationUnits![unit]!;
        const prefix = physical.source.split("\n").slice(0, 2).join("\n");
        assert.equal(actual.sourceName, physical.sourceName);
        // A replaced aggregate hook adds blank lines in other units' excluded
        // branches; those units have no hook and must retain their own bytes.
        assert.equal(
          actual.source
            .split("\n")
            .filter((line) => line.trim() !== "")
            .join("\n"),
          `${prefix}\n${selectBodyUnit(transformed.source, unit)}`
            .split("\n")
            .filter((line) => line.trim() !== "")
            .join("\n"),
        );
        assert.equal(
          actual.source,
          physical.source.replaceAll(teardown, replacement),
        );
        // No assertion is invented in a unit without an original hook.
        if (!physical.source.includes(teardown)) {
          assert.equal(actual.source, physical.source);
        }
        assert.deepEqual(
          actual.source.match(/^#if .*OSEO_MAX_ACTIVE_FRAME_SLOTS.*$/gmu),
          physical.source.match(/^#if .*OSEO_MAX_ACTIVE_FRAME_SLOTS.*$/gmu),
        );
      }
    }
  });
}
