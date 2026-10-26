/* eslint-disable no-await-in-loop -- Reference Scripts have isolated realms. */
import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import { cBackend } from "../packages/backend-c/src/index.ts";
import { compileSource, printMir } from "../packages/compiler/src/index.ts";
import { createDenoHost, createNodeHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import {
  annexbForInExpected,
  annexbForInProgram,
  annexbForInScenarios,
} from "./helpers/annexb-for-in.ts";

const isDeno = "Deno" in globalThis;
const host = isDeno ? createDenoHost() : createNodeHost();
const node = isDeno ? "node" : process.execPath;
const deno = isDeno ? process.execPath : "deno";

test("for-in metadata traces match both independent Script hosts", async () => {
  const directory = await host.makeTemporaryDirectory("oseo-forin-reference-");
  try {
    const path = `${directory}/case.js`;
    for (const scenario of annexbForInScenarios) {
      for (const value of [-20, 0, 7, 20]) {
        const input = { scenario, value };
        await host.writeTextFile(
          path,
          `(0, eval)(${JSON.stringify(annexbForInProgram(input))});\n`,
        );
        for (const reference of [
          { command: node, args: [path] },
          { command: deno, args: ["run", "--quiet", path] },
        ]) {
          const observed = await host.run({ ...reference, cwd: directory });
          assert.equal(
            observed.exitStatus,
            0,
            `${scenario}: ${observed.stderr}`,
          );
          assert.equal(observed.stderr, "", scenario);
          assert.equal(observed.stdout, annexbForInExpected(input), scenario);
        }
      }
    }
  } finally {
    await host.remove(directory);
  }
});

test("for-in subjects emit generic enumeration under both policies", () => {
  for (const scenario of annexbForInScenarios) {
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        {
          source: annexbForInProgram({ scenario, value: 7 }),
          sourceId: `annexb-for-in-${scenario}.js`,
        },
        { specialization, observeSpecialization: true },
      );
      assert.deepEqual(compiled.diagnostics, [], scenario);
      assert.ok(compiled.mir != null, scenario);
      assert.match(printMir(compiled.mir), /enumerate-get/u, scenario);
      const emitted = cBackend.emit(compiled.mir);
      assert.match(emitted.source, /oseo_enumerate_get/u, scenario);
      assert.match(emitted.source, /oseo_enumerate_next/u, scenario);
    }
  }
});
