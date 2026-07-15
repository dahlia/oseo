import assert from "node:assert/strict";
import test from "node:test";

import { cBackend } from "../src/index.ts";

test("emits deterministic generic C without executing a toolchain", () => {
  const range = {
    end: { column: 1, line: 1 },
    start: { column: 1, line: 1 },
  };
  const emitted = cBackend.emit({
    functions: [],
    globalBindings: [],
    kind: "mir-program",
    script: {
      blocks: [
        {
          id: 0,
          operations: [
            {
              arguments: [],
              constant: { kind: "number", value: 42 },
              detail: "42",
              id: 0,
              kind: "constant",
              range,
            },
            {
              arguments: [0],
              detail: "console_log",
              id: 1,
              kind: "call",
              range,
              target: { kind: "console-log" },
            },
            {
              arguments: [1],
              detail: "normal -> continue, abrupt -> return",
              id: 2,
              kind: "check-status",
              range,
            },
          ],
          terminator: { kind: "return", value: 1 },
        },
      ],
      id: -1,
      kind: "mir-function",
      name: "<script>",
      parameterCount: 0,
      parameters: [],
      range,
      rootSlotCount: 3,
    },
    sourceId: "fixture.ts",
  });
  assert.ok(emitted.source.includes("oseo_context_init"));
  assert.ok(emitted.source.includes("oseo_console_log"));
  assert.ok(emitted.source.includes("oseo_frame_enter"));
  assert.ok(emitted.source.includes("oseo_roots_allocate"));
  assert.ok(emitted.source.includes("oseo_number(42.0)"));
  assert.doesNotMatch(emitted.source, /OseoValue roots\[/u);
  assert.equal(emitted.sourceName, "generated.c");
});

test("scans large MIR argument lists without spreading them", () => {
  const range = {
    end: { column: 1, line: 1 },
    start: { column: 1, line: 1 },
  };
  const argumentsValue = Array.from({ length: 150_000 }, (_, index) => index);
  const emitted = cBackend.emit({
    functions: [],
    globalBindings: [],
    kind: "mir-program",
    script: {
      blocks: [
        {
          id: 0,
          operations: [
            {
              arguments: argumentsValue,
              detail: "console_log",
              id: argumentsValue.length,
              kind: "call",
              range,
              target: { kind: "console-log" },
            },
          ],
          terminator: { kind: "return", value: argumentsValue.length },
        },
      ],
      id: -1,
      kind: "mir-function",
      name: "<script>",
      parameterCount: 0,
      parameters: [],
      range,
      rootSlotCount: argumentsValue.length + 1,
    },
    sourceId: "large-arguments.ts",
  });
  assert.match(emitted.source, /roots\[149999\]/u);
  assert.doesNotMatch(emitted.source, /OseoValue call_arguments/u);
});

test("keeps string constant units out of generated stack frames", () => {
  const range = {
    end: { column: 1, line: 1 },
    start: { column: 1, line: 1 },
  };
  const emitted = cBackend.emit({
    functions: [],
    globalBindings: [],
    kind: "mir-program",
    script: {
      blocks: [
        {
          id: 0,
          operations: [
            {
              arguments: [],
              constant: { kind: "string", value: "stack safe" },
              detail: '"stack safe"',
              id: 0,
              kind: "constant",
              range,
            },
            {
              arguments: [0],
              detail: "normal -> continue, abrupt -> return",
              id: 1,
              kind: "check-status",
              range,
            },
          ],
          terminator: { kind: "return", value: 0 },
        },
      ],
      id: -1,
      kind: "mir-function",
      name: "<script>",
      parameterCount: 0,
      parameters: [],
      range,
      rootSlotCount: 2,
    },
    sourceId: "string.ts",
  });
  assert.match(emitted.source, /static const uint16_t string_units_0\[\]/u);
  assert.doesNotMatch(emitted.source, /\(const uint16_t\[\]\)/u);
});
