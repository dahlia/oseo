import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";
import { compileSource, printMir } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
const { lexicalStaticFixtures } =
  await import("./native/fixtures/lexical-static-evidence.ts");
import { lexicalBmpFixtures } from "./native/fixtures/lexical-bmp-comments.ts";

interface Negative {
  readonly path: string;
  readonly sources: readonly string[];
}
const negatives: readonly Negative[] = JSON.parse(
  readFileSync(
    new URL("fixtures/lexical-static-negatives.json", import.meta.url),
    "utf8",
  ),
);

for (const fixture of [...lexicalStaticFixtures, ...lexicalBmpFixtures]) {
  test(`${fixture.name} retains static structure under both policies`, () => {
    for (const specialization of ["disabled", "enabled"] as const) {
      const result = compileSource(
        babelFrontend,
        {
          source: fixture.source,
          sourceId: `${fixture.name}.js`,
        },
        { specialization },
      );
      assert.deepEqual(result.diagnostics, []);
      assert.ok(result.mir);
      // A source-compiling intrinsic must never replace the static subject.
      assert.doesNotMatch(printMir(result.mir), /intrinsic (eval|Function)\b/u);
    }
  });
}

for (const negative of negatives) {
  test(`static parse SyntaxError: ${negative.path}`, () => {
    assert.ok(negative.sources.length > 0);
    for (const source of negative.sources) {
      assert.throws(() => new Script(source), SyntaxError);
      const result = babelFrontend.parse({
        source,
        sourceId: negative.path,
      });
      assert.equal(result.parsed, false, source);
      assert.ok(result.diagnostics.length > 0);
      assert.ok(result.diagnostics.every((d) => d.code === "OSEO0001"));
    }
  });
}

test("BMP matrices retain all code units at their token positions", () => {
  const single = lexicalBmpFixtures[0]!.source;
  const multi = lexicalBmpFixtures[1]!.source;
  const singleUnits = new Set(
    [...single.matchAll(/\/\/var ([\s\S])yy = -1\n/gu)].map((match) =>
      match[1]!.charCodeAt(0),
    ),
  );
  const multiUnits = new Set(
    [...multi.matchAll(/\/\*var ([\s\S])xx = 1\*\/\n/gu)].map((match) =>
      match[1]!.charCodeAt(0),
    ),
  );
  assert.equal(singleUnits.size, 65536);
  assert.equal(multiUnits.size, 65536);
  const singleParsed = babelFrontend.parse({ source: single, sourceId: "s" });
  const multiParsed = babelFrontend.parse({ source: multi, sourceId: "m" });
  assert.equal(singleParsed.parsed, true);
  assert.equal(multiParsed.parsed, true);
  // Comments disappear. Only initial declarations, observations and the
  // four terminator resets/assignments remain as executable statements.
  assert.equal(singleParsed.program?.body.length, 17);
  assert.equal(multiParsed.program?.body.length, 5);
});

test("remaining hashbang completion probes have partial static syntax", () => {
  for (const source of ["#!\n", "#!\n1", "#!2\n", "#!"]) {
    const parsed = babelFrontend.parse({ source, sourceId: "hashbang.js" });
    assert.equal(parsed.parsed, true);
    assert.deepEqual(parsed.diagnostics, []);
  }
  // Parsing acceptance does not observe a Script Completion Record value.
  // These originals therefore stay remediation-owned.
});
