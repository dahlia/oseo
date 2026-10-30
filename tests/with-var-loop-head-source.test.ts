import assert from "node:assert/strict";
import test from "node:test";
import { compileSource } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";

for (const test262Host of [false, true]) {
  for (const head of ["for (var x in { a: 1 })", "for (var x of [1])"]) {
    test(`with resolution: ${head} host=${test262Host}`, () => {
      const compiled = compileSource(
        babelFrontend,
        {
          source: `var x; with ({ x: 0 }) { ${head} {} }`,
          sourceId: "head.js",
        },
        { test262Host },
      );
      assert.deepEqual(compiled.diagnostics, []);
      const environment = compiled.hir!.body.find(
        (entry) => entry.kind === "with",
      );
      assert.equal(environment?.kind, "with");
      if (environment?.kind !== "with" || environment.body.kind !== "block")
        assert.fail("missing with body");
      const loop = environment.body.body[0];
      if (loop?.kind !== "for-in" && loop?.kind !== "for-of")
        assert.fail("missing loop");
      assert.equal(loop.target.kind, "binding");
      if (loop.target.kind !== "binding") assert.fail("missing reference");
      assert.equal(loop.target.withObjectBindingIds?.length, 1);
      assert.equal(loop.target.withGlobalFallback != null, test262Host);
    });
  }
}
