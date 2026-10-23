import assert from "node:assert/strict";
import test from "node:test";
import { buildMir, scriptFragmentAbi } from "@oseo/compiler";
import type {
  HarnessFragment,
  HirProgram,
  HirStatement,
  ScriptFragment,
} from "@oseo/compiler";
import { emitScriptFragments } from "../src/index.ts";

const range = { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };
const hir: HirProgram = {
  kind: "hir-program",
  sourceId: "virtual.js",
  body: [],
  functions: [],
  range,
};
const fragment: ScriptFragment = {
  hir,
  mir: buildMir(hir),
  nextBindingId: 0,
  nextFunctionId: 0,
  launcherInitializers: [],
};
const harness: HarnessFragment = {
  ...fragment,
  abi: scriptFragmentAbi,
  sources: [],
  bindings: [],
  globalReferences: [],
  strict: false,
  options: {},
};

test("an empty unit still exports dispatch and both phase entries", () => {
  const result = emitScriptFragments(harness, fragment, {
    sourceId: "case.js",
    harnessLineOffset: 0,
    bodyLineOffset: 0,
  });
  assert.match(result.harness.source, /oseo_harness_dispatch/u);
  assert.match(result.harness.source, /oseo_harness_resume/u);
  assert.match(result.harness.source, /oseo_harness_instantiate/u);
  assert.match(result.harness.source, /oseo_harness_evaluate/u);
  assert.doesNotMatch(result.harness.source, /case\.js/u);
  assert.doesNotMatch(result.harness.source, /oseo_environment_create/u);
  assert.match(result.launcher.source, /oseo_environment_create/u);
});

test("both fragment phases charge binding access apart from heap roots", () => {
  const declarations: HirProgram = {
    ...hir,
    body: Array.from({ length: 80 }, (_, bindingId): HirStatement[] => [
      {
        kind: "const",
        bindingId,
        hint: undefined,
        initializer: { kind: "number", value: bindingId, range },
        name: `value${bindingId}`,
        range,
      },
      {
        kind: "expression",
        expression: {
          kind: "binding",
          bindingId,
          name: `value${bindingId}`,
          range,
        },
        range,
      },
      {
        kind: "expression",
        expression: {
          kind: "binding-set",
          bindingId,
          mutable: true,
          name: `value${bindingId}`,
          value: { kind: "number", value: bindingId, range },
          range,
        },
        range,
      },
    ]).flat(),
  };
  const body: ScriptFragment = {
    ...fragment,
    hir: declarations,
    mir: buildMir(declarations),
    nextBindingId: 80,
    launcherInitializers: Array.from({ length: 120 }, (_, index) => index),
  };
  const result = emitScriptFragments(harness, body, {
    sourceId: "case.js",
    harnessLineOffset: 0,
    bodyLineOffset: 0,
  });
  assert.equal(
    result.body.source.match(/oseo_roots_allocate\(context, &frame, 203u\)/gu)
      ?.length,
    2,
  );
  assert.equal(
    result.body.source.match(/oseo_frame_enter\(context, 443u\)/gu)?.length,
    2,
  );
});

test("fragment resumes charge original logical slots", () => {
  const fn = {
    ...fragment.mir.script,
    generator: true as const,
    id: 0,
    rootSlotCount: 2002,
    blocks: [
      {
        id: 0,
        operations: [
          {
            arguments: [],
            constant: { kind: "number" as const, value: 1 },
            detail: "1",
            id: 2000,
            kind: "constant" as const,
            range,
          },
        ],
        terminator: { kind: "return" as const, value: 2000 },
      },
    ],
  };
  const result = emitScriptFragments(
    {
      ...harness,
      mir: { ...harness.mir, functions: [fn] },
      nextFunctionId: 1,
    },
    {
      ...fragment,
      mir: { ...fragment.mir, functions: [{ ...fn, id: 1 }] },
      nextFunctionId: 2,
    },
    {
      sourceId: "case.js",
      harnessLineOffset: 0,
      bodyLineOffset: 0,
    },
  );
  for (const [unit, source] of [
    ["harness", result.harness.source],
    ["case", result.body.source],
  ] as const) {
    const resume = source.slice(source.indexOf(`oseo_${unit}_resume`));
    assert.match(
      resume,
      /oseo_frame_enter\(context, OSEO_CALLABLE_FRAME_COST\(2003u\)\)/u,
    );
    assert.match(resume, /result = oseo_generator_body_[01]\(/u);
    assert.match(
      resume,
      /oseo_frame_leave\(context, OSEO_CALLABLE_FRAME_COST\(2003u\)\)/u,
    );
    // Compact heap roots must not replace the conservative stack charge.
    assert.match(source, /oseo_generator_create\(context,[\s\S]*?32u/u);
  }
});
