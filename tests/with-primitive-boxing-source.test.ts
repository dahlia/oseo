import assert from "node:assert/strict";
import test from "node:test";
import { compileSource, printMir } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";

for (const specialization of ["disabled", "enabled"] as const) {
  test(`with entry materializes ToObject (${specialization})`, () => {
    const compiled = compileSource(
      babelFrontend,
      {
        source: "function f(value) { with (value) { return valueOf(); } }",
        sourceId: "with-boxing.js",
      },
      { specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    const mir = printMir(compiled.mir!);
    assert.match(mir, /to-object ToObject for with binding object/u);
    assert.doesNotMatch(mir, /object-coercible/u);
    assert.ok(mir.indexOf("to-object") < mir.indexOf("<with object>"));
  });
}
