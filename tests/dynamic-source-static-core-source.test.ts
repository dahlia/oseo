import assert from "node:assert/strict";
import test from "node:test";
import { compileSource, printMir } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import { staticCore } from "./native/fixtures/dynamic-source-static-core.ts";

for (const fixture of staticCore) {
  test(`${fixture.name} preserves static source under both policies`, () => {
    assert.doesNotMatch(fixture.source, /\beval\s*\(|\bFunction\s*\(/u);
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source: fixture.source, sourceId: `${fixture.name}.js` },
        {
          specialization,
          observeSpecialization: true,
          test262Host: fixture.test262Host === true,
        },
      );
      assert.deepEqual(compiled.diagnostics, [], fixture.name);
      assert.ok(compiled.mir != null);
      const mir = printMir(compiled.mir);
      assert.match(mir, /call/u);
      if (fixture.name.startsWith("ds15-with-")) {
        assert.match(mir, /with/u);
      }
    }
  });
}
