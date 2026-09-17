import assert from "node:assert/strict";
import test from "node:test";
import { buildMir, scriptFragmentAbi } from "@oseo/compiler";
import type {
  HarnessFragment,
  HirProgram,
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
