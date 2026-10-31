import assert from "node:assert/strict";
import test from "node:test";

import { compileSource } from "../../compiler/src/index.ts";
import { babelFrontend } from "../../parser-babel/src/index.ts";
import { runCli } from "../src/index.ts";

test("main-agent policy reaches MIR and generated host setup", () => {
  for (const specialization of ["disabled", "enabled"] as const) {
    for (const mainAgentCanBlock of [false, true]) {
      const compiled = compileSource(
        babelFrontend,
        { source: "Atomics.wait;", sourceId: "policy.js" },
        { mainAgentCanBlock, specialization, test262Host: true },
      );
      assert.deepEqual(compiled.diagnostics, []);
      assert.equal(
        compiled.mir?.test262Host?.mainAgentCanBlock,
        mainAgentCanBlock,
      );
      const emitted = runCli({
        args: [
          "--test262-host",
          ...(mainAgentCanBlock ? [] : ["--test262-non-blocking"]),
          ...(specialization === "disabled" ? ["--no-specialization"] : []),
          "--emit-c",
          "policy.js",
        ],
        source: "Atomics.wait;",
        version: "0.1.0",
      });
      assert.equal(emitted.exitStatus, 0, emitted.stderr);
      assert.ok(
        emitted.stdout.includes(
          `context.agent_can_block = ${mainAgentCanBlock};`,
        ),
      );
    }
  }
});

test("non-blocking CLI policy requires the Script host", () => {
  for (const args of [
    ["--test262-non-blocking", "policy.js"],
    ["--test262-host", "--test262-non-blocking", "--module", "policy.js"],
  ]) {
    const result = runCli({
      args: ["--emit-c", ...args],
      source: "Atomics.wait;",
      version: "0.1.0",
    });
    assert.equal(result.exitStatus, 1);
    assert.match(result.stderr, /policy.js:1:1: error\[OSEO3001\]/u);
  }
});

test("the Script host defaults to a blocking main agent", () => {
  const compiled = compileSource(
    babelFrontend,
    { source: "Atomics.wait;", sourceId: "policy.js" },
    { test262Host: true },
  );
  assert.equal(compiled.mir?.test262Host?.mainAgentCanBlock, true);
});
