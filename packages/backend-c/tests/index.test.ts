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
      functionLength: 0,
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
      functionLength: 0,
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
      functionLength: 0,
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
      "oseo_iterator_close(context, roots[1], completion[0u].kind == 2)",
    ),
  );
});

test("emits the asynchronous iterator protocol entry points", () => {
  const range = {
    end: { column: 1, line: 1 },
    sourceId: "async-iterator.ts",
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
              detail: "GetIterator async",
              id: 1,
              iteratorAsync: true,
              iteratorNextMethodResult: 2,
              kind: "iterator-get",
              range,
            },
            {
              arguments: [1, 2],
              detail: "Await, IteratorStep, and IteratorValue",
              id: 3,
              iteratorAsync: true,
              iteratorValueResult: 4,
              kind: "iterator-next",
              range,
            },
            {
              arguments: [1],
              completionSlot: 0,
              detail: "AsyncIteratorClose",
              id: 5,
              iteratorAsync: true,
              kind: "iterator-close",
              range,
            },
            {
              arguments: [5],
              checkedResult: 5,
              detail: "check async iterator close",
              id: 6,
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
      functionLength: 0,
      parameterCount: 0,
      parameters: [],
      range,
      rootSlotCount: 7,
    },
    sourceId: "async-iterator.ts",
    specialization: "disabled",
  });
  assert.ok(
    emitted.source.includes(
      "oseo_async_iterator_get(context, roots[0], &roots[2])",
    ),
  );
  assert.ok(
    emitted.source.includes(
      "oseo_async_iterator_next(context, roots[1], roots[2], &roots[4],",
    ),
  );
  assert.ok(
    emitted.source.includes(
      "oseo_async_iterator_close(context, roots[1], completion[0u].kind == 2)",
    ),
  );
  // The asynchronous protocol reuses the synchronous done-flag shape, so
  // the loop branch it feeds is unchanged.
  assert.ok(emitted.source.includes("bool fast_3 = !iterator_done_3;"));
  assert.ok(!emitted.source.includes("oseo_iterator_get("));
});

test("emits framed asynchronous iterator step entry points", () => {
  const range = {
    end: { column: 1, line: 1 },
    sourceId: "async-iterator-frame.ts",
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
              arguments: [0, 1],
              detail: "start for-await step",
              id: 2,
              iteratorStepKind: "next",
              iteratorValueOnlyResult: 3,
              kind: "iterator-await-start",
              range,
            },
            {
              arguments: [4, 3],
              detail: "inspect for-await step",
              id: 5,
              iteratorStepKind: "next",
              iteratorValueResult: 6,
              kind: "iterator-await-result",
              range,
            },
            {
              arguments: [0, 1, 6],
              detail: "start delegation step",
              id: 7,
              iteratorStepKind: "delegate-next",
              iteratorValueOnlyResult: 8,
              kind: "iterator-await-start",
              range,
            },
          ],
          terminator: { kind: "return", value: 6 },
        },
      ],
      functionLength: 0,
      id: -1,
      kind: "mir-function",
      name: "<script>",
      parameterCount: 0,
      parameters: [],
      range,
      rootSlotCount: 9,
    },
    sourceId: "async-iterator-frame.ts",
    specialization: "disabled",
  });
  assert.match(emitted.source, /oseo_async_iterator_next_start\(/u);
  assert.match(emitted.source, /oseo_async_iterator_result\(/u);
  assert.match(emitted.source, /oseo_async_iterator_delegate_next_start\(/u);
  assert.match(emitted.source, /roots\[3\] = oseo_boolean\(false\)/u);
  assert.match(emitted.source, /bool fast_5 = !iterator_done_5/u);
});

test("emits delegating iterator steps and a pass-through suspension", () => {
  const range = {
    end: { column: 1, line: 1 },
    sourceId: "delegation.ts",
    start: { column: 1, line: 1 },
  };
  const emitted = cBackend.emit({
    functions: [
      {
        blocks: [
          {
            id: 0,
            operations: [
              {
                arguments: [],
                constant: { kind: "undefined" },
                detail: "sent",
                id: 0,
                kind: "constant",
                range,
              },
              {
                arguments: [1, 2, 0],
                detail: "delegate next",
                id: 3,
                iteratorValueResult: 4,
                kind: "iterator-delegate-next",
                range,
              },
              {
                arguments: [1, 0],
                detail: "delegate return",
                id: 5,
                iteratorValueResult: 6,
                kind: "iterator-delegate-return",
                range,
              },
            ],
            terminator: {
              kind: "generator-yield",
              resume: 1,
              resultObject: true,
              returnResume: 2,
              sent: 7,
              value: 4,
            },
          },
          { id: 1, operations: [], terminator: { kind: "return", value: 7 } },
          { id: 2, operations: [], terminator: { kind: "return", value: 6 } },
        ],
        functionLength: 0,
        generator: true,
        id: 0,
        kind: "mir-function",
        localBindingIds: [],
        name: "delegating",
        parameterCount: 0,
        parameters: [],
        range,
        rootSlotCount: 8,
      },
    ],
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
              detail: "delegating",
              functionId: 0,
              functionKind: "generator",
              functionLength: 0,
              functionName: "delegating",
              id: 0,
              kind: "function-create",
              range,
            },
            {
              arguments: [],
              detail: "call delegating",
              id: 1,
              kind: "call",
              range,
              target: { functionId: 0, kind: "function" },
            },
          ],
          terminator: { kind: "return", value: 1 },
        },
      ],
      functionLength: 0,
      id: -1,
      kind: "mir-function",
      localBindingIds: [],
      name: "<script>",
      parameterCount: 0,
      parameters: [],
      range,
      rootSlotCount: 2,
    },
    sourceId: "delegation.ts",
    specialization: "disabled",
  });
  // The sent value is the delegating step's third operand, and both steps
  // report their result through the shared value slot.
  assert.ok(
    emitted.source.includes(
      "oseo_iterator_delegate_next(context, roots[1], roots[2], " +
        "roots[0], &roots[4], &iterator_done_3);",
    ),
  );
  assert.ok(emitted.source.includes("bool fast_3 = !iterator_done_3;"));
  assert.ok(
    emitted.source.includes(
      "oseo_iterator_delegate_return(context, roots[1], roots[0], " +
        "&roots[6], &iterator_done_5);",
    ),
  );
  // A delegating suspension yields the inner iterator's own result object,
  // so the resumption reports it instead of creating a fresh one.
  assert.ok(
    emitted.source.includes(
      "oseo_generator_suspend(context, generator, 1u, true, " +
        "OSEO_GENERATOR_SUSPEND_YIELD);",
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
      functionLength: 0,
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
      functionLength: 0,
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
      functionLength: 0,
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
      functionLength: 0,
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
      functionLength: 0,
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

test("emits a generator entry and a separately resumable body", () => {
  const range = {
    end: { column: 1, line: 1 },
    sourceId: "generator.js",
    start: { column: 1, line: 1 },
  };
  const emitted = cBackend.emit({
    functions: [
      {
        blocks: [
          {
            id: 0,
            operations: [
              {
                arguments: [],
                constant: { kind: "number", value: 1 },
                detail: "1",
                id: 0,
                kind: "constant",
                range,
              },
            ],
            terminator: {
              kind: "generator-yield",
              resume: 1,
              returnResume: 2,
              sent: 1,
              value: 0,
            },
          },
          {
            id: 1,
            operations: [],
            terminator: { kind: "return", value: 1 },
          },
          {
            id: 2,
            operations: [],
            terminator: { kind: "return", value: 1 },
          },
        ],
        functionLength: 0,
        generator: true,
        id: 0,
        kind: "mir-function",
        localBindingIds: [],
        name: "counter",
        parameterCount: 0,
        parameters: [],
        range,
        rootSlotCount: 2,
      },
    ],
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
              detail: "counter",
              functionId: 0,
              functionKind: "generator",
              functionLength: 0,
              functionName: "counter",
              id: 0,
              kind: "function-create",
              range,
            },
            {
              arguments: [],
              detail: "call counter",
              id: 1,
              kind: "call",
              range,
              target: { functionId: 0, kind: "function" },
            },
          ],
          terminator: { kind: "return", value: 1 },
        },
      ],
      functionLength: 0,
      id: -1,
      kind: "mir-function",
      localBindingIds: [],
      name: "<script>",
      parameterCount: 0,
      parameters: [],
      range,
      rootSlotCount: 2,
    },
    sourceId: "generator.ts",
    specialization: "disabled",
  });
  assert.match(emitted.source, /OSEO_FUNCTION_GENERATOR/u);
  // The call entry allocates only the frame that roots the new
  // generator; the body's roots belong to the generator record.
  assert.match(
    emitted.source,
    /oseo_generator_create\(context, callee, receiver, \d+u, 0u\);/u,
  );
  assert.match(emitted.source, /roots = oseo_generator_slots\(frame\.slots/u);
  assert.match(
    emitted.source,
    /static OseoResult oseo_generator_body_0\(\n {4}OseoContext \*context/u,
  );
  assert.match(
    emitted.source,
    new RegExp(
      "switch \\(oseo_generator_resume_point\\(generator\\)\\) \\{\\n" +
        " {4}case 0u: goto bb0;\\n {4}case 1u: goto bb1;",
      "u",
    ),
  );
  assert.match(
    emitted.source,
    new RegExp(
      "oseo_generator_suspend\\(context, generator, 1u, false, " +
        "OSEO_GENERATOR_SUSPEND_YIELD\\);",
      "u",
    ),
  );
  assert.match(
    emitted.source,
    /roots\[1\] = oseo_generator_sent\(generator\);/u,
  );
  // A return resumption leaves the body from the suspension point rather
  // than continuing at the resume block.
  assert.match(
    emitted.source,
    new RegExp(
      "if \\(oseo_generator_resume_kind\\(generator\\) == " +
        "OSEO_GENERATOR_RESUME_RETURN\\) goto bb2;",
      "u",
    ),
  );
  assert.match(emitted.source, /oseo_context_set_generator_dispatcher/u);
  assert.match(
    emitted.source,
    /case 0u:\n {8}return oseo_generator_body_0\(context, generator\);/u,
  );
  // A suspended body must not release a native frame it does not own.
  const bodyStart = emitted.source.indexOf(
    "static OseoResult oseo_generator_body_0(\n",
  );
  const body = emitted.source.slice(
    bodyStart,
    emitted.source.indexOf("\nstatic OseoResult ", bodyStart + 1),
  );
  assert.doesNotMatch(body, /oseo_roots_release/u);
});

test("emits an awaited suspension and a throw resumption branch", () => {
  const range = {
    end: { column: 1, line: 1 },
    sourceId: "async-generator.js",
    start: { column: 1, line: 1 },
  };
  const emitted = cBackend.emit({
    functions: [
      {
        asyncGenerator: true,
        blocks: [
          {
            id: 0,
            operations: [
              {
                arguments: [],
                constant: { kind: "number", value: 1 },
                detail: "1",
                id: 0,
                kind: "constant",
                range,
              },
            ],
            terminator: {
              awaited: true,
              kind: "generator-yield",
              resume: 1,
              sent: 1,
              throwResume: 2,
              value: 0,
            },
          },
          {
            id: 1,
            operations: [],
            terminator: { kind: "return", value: 1 },
          },
          {
            id: 2,
            operations: [],
            terminator: { completionSlot: 0, kind: "resume-completion" },
          },
        ],
        functionLength: 0,
        generator: true,
        id: 0,
        kind: "mir-function",
        localBindingIds: [],
        name: "awaiting",
        parameterCount: 0,
        parameters: [],
        range,
        rootSlotCount: 2,
      },
    ],
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
              detail: "awaiting",
              functionId: 0,
              functionKind: "async-generator",
              functionLength: 0,
              functionName: "awaiting",
              id: 0,
              kind: "function-create",
              range,
            },
            {
              arguments: [],
              detail: "call awaiting",
              id: 1,
              kind: "call",
              range,
              target: { functionId: 0, kind: "function" },
            },
          ],
          terminator: { kind: "return", value: 1 },
        },
      ],
      functionLength: 0,
      id: -1,
      kind: "mir-function",
      localBindingIds: [],
      name: "<script>",
      parameterCount: 0,
      parameters: [],
      range,
      rootSlotCount: 2,
    },
    sourceId: "async-generator.ts",
    specialization: "disabled",
  });
  assert.match(emitted.source, /OSEO_FUNCTION_ASYNC_GENERATOR/u);
  // An awaited suspension names its own reason, so the driver settles the
  // value instead of reporting it as an iteration step.
  assert.match(
    emitted.source,
    new RegExp(
      "oseo_generator_suspend\\(context, generator, 1u, false, " +
        "OSEO_GENERATOR_SUSPEND_AWAIT\\);",
      "u",
    ),
  );
  assert.match(
    emitted.source,
    new RegExp(
      "if \\(oseo_generator_resume_kind\\(generator\\) == " +
        "OSEO_GENERATOR_RESUME_THROW\\) goto bb2;",
      "u",
    ),
  );
  // No return completion reaches an awaited suspension, so no branch
  // delivers one.
  assert.doesNotMatch(emitted.source, /OSEO_GENERATOR_RESUME_RETURN/u);
});

test("keeps a generator body's iterator done state in its root slots", () => {
  const range = {
    end: { column: 1, line: 1 },
    sourceId: "iterator-generator.js",
    start: { column: 1, line: 1 },
  };
  const emitted = cBackend.emit({
    functions: [
      {
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
                iteratorDoneState: 3,
                iteratorNextMethodResult: 2,
                kind: "iterator-get",
                range,
              },
            ],
            // The suspension falls between the iterator's creation and its
            // first step, so a fresh body invocation resumes mid-iteration.
            terminator: {
              kind: "generator-yield",
              resume: 1,
              returnResume: 2,
              sent: 4,
              value: 0,
            },
          },
          {
            id: 1,
            operations: [
              {
                arguments: [1, 2],
                detail: "step iterator",
                id: 5,
                iteratorDoneState: 3,
                iteratorValueResult: 6,
                kind: "iterator-next",
                range,
              },
            ],
            terminator: { kind: "jump", target: 3 },
          },
          {
            id: 2,
            operations: [],
            terminator: { kind: "return", value: 4 },
          },
          {
            id: 3,
            operations: [
              {
                arguments: [1],
                completionSlot: 0,
                detail: "close iterator",
                id: 7,
                iteratorDoneState: 3,
                kind: "iterator-close",
                range,
              },
            ],
            terminator: { kind: "return", value: 6 },
          },
        ],
        functionLength: 0,
        generator: true,
        id: 0,
        kind: "mir-function",
        localBindingIds: [],
        name: "steps",
        parameterCount: 0,
        parameters: [],
        range,
        rootSlotCount: 8,
      },
    ],
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
              detail: "steps",
              functionId: 0,
              functionKind: "generator",
              functionLength: 0,
              functionName: "steps",
              id: 0,
              kind: "function-create",
              range,
            },
          ],
          terminator: { kind: "return", value: 0 },
        },
      ],
      functionLength: 0,
      id: -1,
      kind: "mir-function",
      localBindingIds: [],
      name: "<script>",
      parameterCount: 0,
      parameters: [],
      range,
      rootSlotCount: 1,
    },
    sourceId: "iterator-generator.ts",
    specialization: "disabled",
  });
  const bodyStart = emitted.source.indexOf(
    "static OseoResult oseo_generator_body_0(\n",
  );
  const body = emitted.source.slice(
    bodyStart,
    emitted.source.indexOf("\nstatic OseoResult ", bodyStart + 1),
  );
  // An automatic local would read indeterminate state on resumption, so
  // the flag belongs to the generator record's slots instead.
  assert.doesNotMatch(body, /bool iterator_done_3\b/u);
  assert.ok(body.includes("roots[3] = oseo_boolean(false);"));
  assert.ok(
    body.includes("bool iterator_step_done_5 = oseo_to_boolean(roots[3]);"),
  );
  assert.ok(
    body.includes(
      "oseo_iterator_next(context, roots[1], roots[2], &roots[6], " +
        "&iterator_step_done_5);",
    ),
  );
  assert.ok(body.includes("roots[3] = oseo_boolean(iterator_step_done_5);"));
  assert.ok(body.includes("if (oseo_to_boolean(roots[3])) {"));
});
