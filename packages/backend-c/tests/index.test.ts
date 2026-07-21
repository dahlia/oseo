import assert from "node:assert/strict";
import test from "node:test";

import { cBackend } from "../src/index.ts";

test("emits deterministic generic C without executing a toolchain", () => {
  const range = {
    end: { column: 1, line: 1 },
    sourceId: "dependency.js",
    start: { column: 1, line: 1 },
  };
  const emitted = cBackend.emit({
    functions: [],
    globalBindings: [],
    kind: "mir-program",
    observeSpecialization: false,
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
    specialization: "disabled",
  });
  assert.ok(emitted.source.includes("oseo_context_init"));
  assert.ok(emitted.source.includes("oseo_context_set_function_dispatcher"));
  assert.ok(emitted.source.includes("oseo_console_log"));
  assert.ok(emitted.source.includes("oseo_frame_enter"));
  assert.ok(emitted.source.includes("oseo_roots_allocate"));
  assert.ok(emitted.source.includes("oseo_number(42.0)"));
  assert.match(
    emitted.source,
    /oseo_context_source_location\(context, "dependency\.js", 13u,/u,
  );
  assert.doesNotMatch(emitted.source, /OseoValue roots\[/u);
  assert.equal(emitted.sourceName, "generated.c");
});

test("emits error intrinsic loads and thrown-value rendering", () => {
  const range = {
    end: { column: 1, line: 1 },
    sourceId: "errors.ts",
    start: { column: 1, line: 1 },
  };
  const emitted = cBackend.emit({
    functions: [],
    globalBindings: [],
    kind: "mir-program",
    observeSpecialization: false,
    script: {
      blocks: [
        {
          id: 0,
          operations: [
            {
              arguments: [],
              detail: "intrinsic TypeError",
              errorName: "TypeError",
              id: 0,
              kind: "error-intrinsic",
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
    sourceId: "errors.ts",
    specialization: "disabled",
  });
  assert.ok(
    emitted.source.includes("oseo_error_intrinsic(context, OSEO_ERROR_TYPE)"),
  );
  assert.ok(
    emitted.source.includes(
      "oseo_context_print_thrown(&context, result.value)",
    ),
  );
  assert.ok(!emitted.source.includes("oseo_context_print_error(&context)"));
});

test("emits rooted iterator protocol operations", () => {
  const range = {
    end: { column: 1, line: 1 },
    sourceId: "iterator.ts",
    start: { column: 1, line: 1 },
  };
  const emitted = cBackend.emit({
    functions: [],
    globalBindings: [],
    kind: "mir-program",
    observeSpecialization: false,
    script: {
      blocks: [
        {
          id: 0,
          operations: [
            {
              arguments: [],
              constant: { kind: "undefined" },
              detail: "iterable",
              id: 0,
              kind: "constant",
              range,
            },
            {
              arguments: [0],
              detail: "get iterator",
              id: 1,
              iteratorNextMethodResult: 2,
              kind: "iterator-get",
              range,
            },
            {
              arguments: [1],
              checkedResult: 1,
              detail: "check get iterator",
              id: 3,
              kind: "check-status",
              range,
            },
            {
              arguments: [1, 2],
              detail: "step iterator",
              id: 4,
              iteratorValueResult: 5,
              kind: "iterator-next",
              range,
            },
            {
              arguments: [4],
              checkedResult: 4,
              detail: "check iterator step",
              id: 6,
              kind: "check-status",
              range,
            },
            {
              arguments: [1],
              completionSlot: 0,
              detail: "close iterator",
              id: 7,
              kind: "iterator-close",
              range,
            },
            {
              arguments: [7],
              checkedResult: 7,
              detail: "check iterator close",
              id: 8,
              kind: "check-status",
              range,
            },
          ],
          terminator: { kind: "return", value: 5 },
        },
      ],
      id: -1,
      kind: "mir-function",
      name: "<script>",
      parameterCount: 0,
      parameters: [],
      range,
      rootSlotCount: 9,
    },
    sourceId: "iterator.ts",
    specialization: "disabled",
  });
  assert.ok(
    emitted.source.includes("oseo_iterator_get(context, roots[0], &roots[2])"),
  );
  assert.ok(
    emitted.source.includes(
      "oseo_iterator_next(context, roots[1], roots[2], &roots[5],",
    ),
  );
  assert.ok(emitted.source.includes("bool fast_4 = !iterator_done_4;"));
  assert.ok(
    emitted.source.includes(
      "oseo_iterator_close(context, roots[1], completion_kind[0u] == 2)",
    ),
  );
});

test("emits dynamic array accumulation operations", () => {
  const range = {
    end: { column: 1, line: 1 },
    sourceId: "array-spread.ts",
    start: { column: 1, line: 1 },
  };
  const emitted = cBackend.emit({
    functions: [],
    globalBindings: [],
    kind: "mir-program",
    observeSpecialization: false,
    script: {
      blocks: [
        {
          id: 0,
          operations: [
            {
              arguments: [],
              arrayLength: 0,
              detail: "array length 0",
              id: 0,
              kind: "array-create",
              range,
            },
            {
              arguments: [],
              constant: { kind: "number", value: 7 },
              detail: "7",
              id: 1,
              kind: "constant",
              range,
            },
            {
              arguments: [0, 1],
              detail: "append array value",
              id: 2,
              kind: "array-append",
              range,
            },
            {
              arguments: [2],
              detail: "check array append",
              id: 3,
              kind: "check-status",
              range,
            },
            {
              arguments: [0],
              detail: "append array hole",
              id: 4,
              kind: "array-append-hole",
              range,
            },
            {
              arguments: [4],
              detail: "check array hole",
              id: 5,
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
      rootSlotCount: 6,
    },
    sourceId: "array-spread.ts",
    specialization: "disabled",
  });
  assert.ok(
    emitted.source.includes("oseo_array_append(context, roots[0], roots[1])"),
  );
  assert.ok(
    emitted.source.includes("oseo_array_append_hole(context, roots[0])"),
  );
});

test("emits GC-rooted dynamic argument lists", () => {
  const range = {
    end: { column: 1, line: 1 },
    start: { column: 1, line: 1 },
  };
  const emitted = cBackend.emit({
    functions: [],
    globalBindings: [],
    kind: "mir-program",
    observeSpecialization: false,
    script: {
      blocks: [
        {
          id: 0,
          operations: [
            {
              arguments: [],
              detail: "create argument list",
              id: 0,
              kind: "argument-list-create",
              range,
            },
            {
              arguments: [],
              constant: { kind: "number", value: 7 },
              detail: "7",
              id: 1,
              kind: "constant",
              range,
            },
            {
              arguments: [0, 1],
              detail: "append call argument",
              id: 2,
              kind: "argument-list-append",
              range,
            },
            {
              arguments: [2],
              detail: "normal -> continue, abrupt -> return",
              id: 3,
              kind: "check-status",
              range,
            },
            {
              argumentListId: 0,
              arguments: [],
              detail: "console_log",
              id: 4,
              kind: "call",
              range,
              target: { kind: "console-log" },
            },
            {
              arguments: [4],
              detail: "normal -> continue, abrupt -> return",
              id: 5,
              kind: "check-status",
              range,
            },
          ],
          terminator: { kind: "return", value: 4 },
        },
      ],
      id: -1,
      kind: "mir-function",
      name: "<script>",
      parameterCount: 0,
      parameters: [],
      range,
      rootSlotCount: 6,
    },
    sourceId: "argument-list.ts",
    specialization: "disabled",
  });
  assert.ok(emitted.source.includes("oseo_argument_list_create(context)"));
  assert.ok(
    emitted.source.includes(
      "oseo_argument_list_append(context, roots[0], roots[1])",
    ),
  );
  assert.ok(
    emitted.source.includes(
      "oseo_argument_list_view(context, roots[0], &argument_count_4,",
    ),
  );
  assert.ok(
    emitted.source.includes(
      "oseo_console_log(context, argument_count_4, argument_values_4)",
    ),
  );
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
    observeSpecialization: false,
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
    specialization: "disabled",
  });
  assert.match(emitted.source, /roots\[149999\]/u);
  assert.doesNotMatch(emitted.source, /OseoValue call_arguments/u);
});

test("scans large MIR binding sets without spreading them", () => {
  const range = {
    end: { column: 1, line: 1 },
    start: { column: 1, line: 1 },
  };
  const emitted = cBackend.emit({
    functions: [],
    globalBindings: Array.from({ length: 200_000 }, (_, id) => ({
      id,
      name: `binding${id}`,
    })),
    kind: "mir-program",
    observeSpecialization: false,
    script: {
      blocks: [
        {
          id: 0,
          operations: [],
          terminator: { kind: "return", value: 0 },
        },
      ],
      id: -1,
      kind: "mir-function",
      name: "<script>",
      parameterCount: 0,
      parameters: [],
      range,
      rootSlotCount: 1,
    },
    sourceId: "large-bindings.ts",
    specialization: "disabled",
  });
  assert.match(emitted.source, /oseo_environment_create\(context, 200000u\)/u);
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
    observeSpecialization: false,
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
    specialization: "disabled",
  });
  assert.match(emitted.source, /static const uint16_t string_units_0\[\]/u);
  assert.doesNotMatch(emitted.source, /\(const uint16_t\[\]\)/u);
});
