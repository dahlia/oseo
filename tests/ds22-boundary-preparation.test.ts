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
  ds22ConstructorTextMutation,
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
      if (specialization === "enabled") {
        assert.match(mir, /guard-object/u);
        assert.match(mir, /guard-shape/u);
        assert.match(mir, /load-fixed-slot/u);
      } else {
        assert.doesNotMatch(mir, /guard-object|guard-shape|load-fixed-slot/u);
      }
      assert.match(mir, /catch/u);
      // Ordinary gets reach the runtime directly or through the generated
      // archive composition that the Array cost remedy introduced.
      assert.match(emitted, /oseo_object_get|oseo_generated_property_get/u);
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
      for (const constructorText of [false, true]) {
        const source = constructorText
          ? ds22ConstructorTextMutation(fixture.source)
          : fixture.source;
        // The harness selects the Script goal; the witness itself is static.
        await host.writeTextFile(
          sourcePath,
          `(0, eval)(${JSON.stringify(source)});\n`,
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
            ds22BoundaryCoreExpected(fixture.name, constructorText),
            fixture.name,
          );
        }
      }
    }
  } finally {
    await host.remove(directory);
  }
});
