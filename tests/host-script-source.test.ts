/* eslint-disable no-await-in-loop -- Reference realms are isolated. */
import assert from "node:assert/strict";
import test from "node:test";
import { cBackend } from "../packages/backend-c/src/index.ts";
import { compileSource } from "../packages/compiler/src/index.ts";
import { createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { assertMatchingObservations } from "../packages/testkit/src/index.ts";
import * as fixtures from "./native/fixtures/host-script-bindings.ts";
import { hostScriptReferences } from "./native/host-script-reference.ts";

const host = createNodeHost();

test("fixed host Scripts agree with Node and Deno", async () => {
  for (const fixture of fixtures.hostScriptBindingFixtures) {
    const references = await hostScriptReferences(host, fixture.source);
    assertMatchingObservations([
      { stdout: fixture.expected, stderr: "", exitStatus: 0 },
      references[0]!,
    ]);
    assertMatchingObservations([
      {
        stdout: fixture.denoExpected ?? fixture.expected,
        stderr: "",
        exitStatus: 0,
      },
      references[1]!,
    ]);
  }
});

test("fixed host Scripts emit under both policies", () => {
  for (const fixture of fixtures.hostScriptBindingFixtures) {
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source: fixture.source, sourceId: `${fixture.name}.js` },
        { specialization, test262Host: true },
      );
      assert.deepEqual(compiled.diagnostics, [], fixture.name);
      const emitted = cBackend.emit(compiled.mir!);
      assert.ok(
        emitted.source.includes("oseo_test262_host_install"),
        fixture.name,
      );
    }
  }
});

test("host Script functions tail-call; evaluators retain completion", () => {
  const fixture = fixtures.hostScriptBindingFixtures.find(
    (entry) =>
      entry.name === "strict tail calls retain foreign Script lexicals",
  )!;
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source: fixture.source, sourceId: "host-tail-interaction.js" },
      { specialization, test262Host: true },
    );
    assert.deepEqual(compiled.diagnostics, []);
    const mir = compiled.mir!;
    for (const evaluator of [
      mir.script,
      ...mir.functions.filter((fn) => fn.hostScript != null),
    ]) {
      assert.ok(
        evaluator.blocks.every((block) =>
          block.operations.every((operation) => operation.tail !== true),
        ),
        evaluator.name,
      );
    }
    for (const name of [
      "tail",
      "fail",
      "forward",
      "nested",
      "say",
      "mainTail",
    ]) {
      const fn = mir.functions.find((entry) => entry.name === name)!;
      assert.ok(fn, name);
      assert.ok(
        fn.blocks.some((block) =>
          block.operations.some((operation) => operation.tail === true),
        ),
        name,
      );
    }
    const emitted = cBackend.emit(mir).source;
    assert.match(emitted, /oseo_tail_call\(context/u);
    assert.match(emitted, /oseo_call_function\(context/u);
    assert.match(emitted, /oseo_global_environment\(context/u);
    assert.match(emitted, /oseo_script_lexicals_install\(context/u);
  }
});
