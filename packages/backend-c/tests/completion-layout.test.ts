import assert from "node:assert/strict";
import test from "node:test";
import type { MirBlock, MirOperation, MirProgram } from "@oseo/compiler";

import { cBackend } from "../src/index.ts";
import { createCompletionLayout } from "../src/completion-layout.ts";

const range = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 1 },
};

function operation(
  kind: MirOperation["kind"],
  properties: Partial<MirOperation>,
): MirOperation {
  return {
    arguments: [],
    detail: "fixture",
    id: 0,
    kind,
    range,
    ...properties,
  };
}

test("completion layout sorts storage IDs and excludes saved targets", () => {
  const blocks: readonly MirBlock[] = [
    {
      id: 0,
      operations: [
        operation("completion-set", {
          completionSlot: 70,
          completionKind: "jump",
          completionTarget: { blockId: 800, cleanupDepth: 2 },
        }),
        operation("check-status", {
          abruptTarget: { blockId: 90, cleanupDepth: 1 },
        }),
        operation("caught", { completionSlot: 90 }),
        operation("iterator-close", { completionSlot: 70 }),
        operation("iterator-close-start", { completionSlot: 40 }),
      ],
      terminator: {
        kind: "resume-completion",
        completionSlot: 70,
        outerAbrupt: { blockId: 10, cleanupDepth: 0 },
        outerFinalizer: { blockId: 20, cleanupDepth: 0 },
      },
    },
  ];
  const layout = createCompletionLayout(blocks);
  assert.equal(layout.count, 5);
  assert.deepEqual([10, 20, 40, 70, 90].map(layout.slot), [0, 1, 2, 3, 4]);
  assert.throws(() => layout.slot(800), /No physical slot for completion 800/u);
});

test("direct throw identity zero differs from saved target zero", () => {
  const block: MirBlock = {
    id: 0,
    operations: [
      operation("completion-set", {
        completionSlot: 12,
        completionKind: "return",
        completionTarget: { blockId: 0, cleanupDepth: 0 },
      }),
    ],
    terminator: { kind: "unreachable" },
  };
  const noZero = createCompletionLayout([block]);
  assert.equal(noZero.count, 1);
  assert.equal(noZero.slot(12), 0);
  assert.throws(() => noZero.slot(0), /No physical slot/u);
  const directThrow = createCompletionLayout([
    {
      ...block,
      operations: [
        operation("completion-set", {
          completionSlot: 0,
          completionKind: "throw",
        }),
      ],
      terminator: { kind: "resume-completion", completionSlot: 0 },
    },
  ]);
  assert.equal(directThrow.count, 1);
  assert.equal(directThrow.slot(0), 0);
});

test("layouts isolate functions and share entry/body slots", () => {
  const block = (id: number, completionSlot: number): MirBlock => ({
    id,
    operations: [operation("caught", { completionSlot })],
    terminator: { kind: "unreachable" },
  });
  const entry = block(0, 9);
  const body = block(40, 80);
  const union = createCompletionLayout([entry, body]);
  assert.deepEqual([union.slot(9), union.slot(80)], [0, 1]);
  const separate = createCompletionLayout([body]);
  assert.equal(separate.slot(80), 0);
  assert.throws(() => separate.slot(9), /No physical slot/u);
  assert.equal(createCompletionLayout([]).count, 0);
});

test("invalid storage identities fail before emitting an array index", () => {
  for (const completionSlot of [-1, 0.5, NaN, Infinity]) {
    assert.throws(
      () =>
        createCompletionLayout([
          {
            id: 0,
            operations: [operation("caught", { completionSlot })],
            terminator: { kind: "unreachable" },
          },
        ]),
      /Invalid completion storage identity/u,
    );
  }
});

test("emission maps copies and retains logical guards", () => {
  const program: MirProgram = {
    kind: "mir-program",
    sourceId: "sparse-completion.js",
    specialization: "disabled",
    observeSpecialization: false,
    functions: [],
    globalBindings: [],
    globalObjectBindings: [],
    script: {
      kind: "mir-function",
      id: -1,
      name: "<script>",
      range,
      parameters: [],
      parameterCount: 0,
      functionLength: 0,
      rootSlotCount: 4,
      blocks: [
        {
          id: 0,
          operations: [
            operation("constant", {
              constant: { kind: "number", value: 7 },
            }),
            operation("check-status", {
              id: 1,
              arguments: [0],
              abruptTarget: { blockId: 70, cleanupDepth: 0 },
            }),
          ],
          terminator: { kind: "jump", target: 70 },
        },
        {
          id: 70,
          operations: [
            operation("caught", { id: 2, completionSlot: 70 }),
            operation("completion-set", {
              id: 3,
              arguments: [2],
              completionSlot: 90,
              completionKind: "return",
              completionTarget: { blockId: 0, cleanupDepth: 0 },
            }),
          ],
          terminator: { kind: "jump", target: 90 },
        },
        {
          id: 80,
          operations: [],
          terminator: {
            kind: "resume-completion",
            completionSlot: 80,
          },
        },
        {
          id: 90,
          operations: [],
          terminator: {
            kind: "resume-completion",
            completionSlot: 90,
            outerAbrupt: { blockId: 70, cleanupDepth: 0 },
            outerFinalizer: { blockId: 80, cleanupDepth: 0 },
          },
        },
      ],
    },
  };
  const { source } = cBackend.emit(program);
  assert.match(source, /OseoCompletionRecord completion\[3u\]/u);
  assert.match(source, /oseo_roots_allocate\(context, &frame, 35u\)/u);
  // 32 value/argument roots plus the old 91-slot logical reservation.
  assert.match(source, /oseo_frame_enter\(\s*&context, 123u\)/u);
  assert.match(source, /#if 123u > OSEO_MAX_ACTIVE_FRAME_SLOTS/u);
  assert.match(source, /completion\[0u\] = completion\[2u\]/u);
  assert.match(source, /roots\[32u\] = roots\[34u\]/u);
  assert.match(source, /completion\[1u\] = completion\[2u\]/u);
  assert.match(source, /roots\[33u\] = roots\[34u\]/u);
  assert.match(source, /completion\[2u\]\.target = 0u/u);
  assert.match(source, /goto bb70/u);
  assert.match(source, /goto bb80/u);
  assert.doesNotMatch(source, /completion\[(?:70|80|90)u\]/u);
});
