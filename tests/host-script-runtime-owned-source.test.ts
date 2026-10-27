/* eslint-disable no-await-in-loop -- Reference realms are isolated. */
import assert from "node:assert/strict";
import test from "node:test";
import { cBackend } from "../packages/backend-c/src/index.ts";
import { compileSource, printMir } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { assertMatchingObservations } from "../packages/testkit/src/index.ts";
import * as fixtures from "./native/fixtures/host-script-runtime-owned.ts";
import { hostScriptReferences } from "./native/host-script-reference.ts";

const host = createNodeHost();

for (const fixture of fixtures.runtimeOwnedScriptFixtures) {
  test(`host runtime-owned source: ${fixture.name}`, async () => {
    const expected = { stdout: fixture.expected, stderr: "", exitStatus: 0 };
    const references = await hostScriptReferences(host, fixture.source);
    assertMatchingObservations([expected, ...references]);
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source: fixture.source, sourceId: fixture.name + ".js" },
        { specialization, test262Host: true, observeSpecialization: true },
      );
      assert.deepEqual(compiled.diagnostics, []);
      const mir = printMir(compiled.mir!);
      assert.match(mir, /host Script runtime-owned binding/u);
      assert.match(mir, /host intrinsic fallback/u);
      const emitted = cBackend.emit(compiled.mir!);
      assert.ok(emitted.source.includes("oseo_call_function"));
      assert.ok(
        emitted.source.includes("oseo_console_log") ||
          emitted.source.includes("oseo_set_timeout"),
      );
    }
  });
}

test("host runtime-owned fallback preserves strict tail marking", () => {
  const source = `
$262.evalScript('function setTimeout(n) { return n; }');
function forward(n) { 'use strict'; return setTimeout(n); }
forward(1);
`;
  for (const specialization of ["disabled", "enabled"] as const) {
    const result = compileSource(
      babelFrontend,
      { source, sourceId: "host-runtime-tail.js" },
      { specialization, test262Host: true },
    );
    assert.deepEqual(result.diagnostics, []);
    const forward = result.mir!.functions.find((fn) => fn.name === "forward")!;
    const calls = forward.blocks
      .flatMap((block) => block.operations)
      .filter((operation) => operation.kind === "call");
    assert.ok(calls.some((call) => call.target?.kind === "dynamic"));
    assert.ok(calls.some((call) => call.target?.kind === "timer-intrinsic"));
    assert.ok(calls.every((call) => call.tail === true));
    assert.match(cBackend.emit(result.mir!).source, /oseo_tail_call/u);
  }
});

test("ordinary runtime-owned calls keep their existing private targets", () => {
  const compiled = compileSource(babelFrontend, {
    source: "console.log(1); clearTimeout(0);",
    sourceId: "ordinary-runtime.js",
  });
  assert.deepEqual(compiled.diagnostics, []);
  const mir = printMir(compiled.mir!);
  assert.doesNotMatch(mir, /host Script runtime-owned binding/u);
  assert.doesNotMatch(mir, /global-environment/u);
  for (const source of [
    "console;",
    "typeof setTimeout;",
    "delete clearTimeout;",
  ]) {
    const result = compileSource(
      babelFrontend,
      { source, sourceId: "private-runtime-value.js" },
      { test262Host: true },
    );
    assert.ok(
      result.diagnostics.some((diagnostic) => diagnostic.code === "OSEO1001"),
    );
  }
});
