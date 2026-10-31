/* eslint-disable no-await-in-loop -- Scripts run in isolated processes. */
import assert from "node:assert/strict";
import test from "node:test";
import process from "node:process";

import { cBackend } from "../packages/backend-c/src/index.ts";
import { compileSource, printMir } from "../packages/compiler/src/index.ts";
import { createNodeHost, createDenoHost } from "../packages/host/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import {
  ds22BoundaryCoreExpected,
  ds22BoundaryCoreFixtures,
} from "./native/fixtures/ds22-boundary-core.ts";

for (const fixture of ds22BoundaryCoreFixtures) {
  test(`${fixture.name} keeps static scope and generic errors`, () => {
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source: fixture.source, sourceId: `${fixture.name}.js` },
        { specialization, observeSpecialization: true },
      );
      assert.deepEqual(compiled.diagnostics, []);
      assert.ok(compiled.mir != null);
      const mir = printMir(compiled.mir);
      const emitted = cBackend.emit(compiled.mir).source;
      assert.match(mir, /catch/u);
      assert.match(emitted, /oseo_object_get/u);
      assert.doesNotMatch(
        fixture.source,
        /\beval\s*\(|\b(?:new\s+)?Function\s*\(/u,
      );
      if (fixture.name.endsWith("-scope")) {
        assert.match(mir, /read \*missing intrinsic:ds22Local\*/u);
        assert.doesNotMatch(mir, /global-object[^\n]*ds22Local/u);
      } else {
        assert.match(mir, /property-get/u);
      }
    }
  });
}

test("DS-22 fixed observations match both Script reference hosts", async () => {
  const isDeno = "Deno" in globalThis;
  const host = isDeno ? createDenoHost() : createNodeHost();
  const directory = await host.makeTemporaryDirectory("oseo-ds22-reference-");
  try {
    const sourcePath = `${directory}/reference.js`;
    for (const fixture of ds22BoundaryCoreFixtures) {
      // The harness selects the Script goal; the witness itself is static.
      await host.writeTextFile(
        sourcePath,
        `(0, eval)(${JSON.stringify(fixture.source)});\n`,
      );
      for (const command of [
        { command: isDeno ? "node" : process.execPath, args: [sourcePath] },
        {
          command: isDeno ? process.execPath : "deno",
          args: ["run", "--quiet", sourcePath],
        },
      ]) {
        const observed = await host.run({ ...command, cwd: directory });
        assert.equal(observed.exitStatus, 0, observed.stderr);
        assert.equal(observed.stderr, "");
        assert.equal(
          observed.stdout,
          ds22BoundaryCoreExpected(fixture.name),
          fixture.name,
        );
      }
    }
  } finally {
    await host.remove(directory);
  }
});
