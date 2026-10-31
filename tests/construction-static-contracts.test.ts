import assert from "node:assert/strict";
import test from "node:test";
import { Script } from "node:vm";
import { cBackend } from "../packages/backend-c/src/index.ts";
import { compileSource, printMir } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import * as fixture from "./native/fixtures/construction-static-contracts.ts";

// These are complete ordinary function definitions, never evaluated source.
const negatives = [
  ["separated duplicate strict", 'function f(a,b,a){"use strict";}'],
  ["adjacent duplicate strict", 'function f(a,a){"use strict";}'],
  ["eval strict", 'function f(eval){"use strict";}'],
  ["arguments strict", 'function f(arguments){"use strict";}'],
  ["strict with", 'function f(){"use strict";with({}){}}'],
  ["unbound private", "function f(){let o={};o.#f;}"],
  ["invalid variable binding", "function f(){var 1=1;}"],
  ["invalid parameter list", "function f(1,1){return this;}"],
] as const;

for (const [name, source] of negatives) {
  test(`construction ordinary grammar: ${name}`, () => {
    assert.throws(() => new Script(source), SyntaxError);
    for (const specialization of ["disabled", "enabled"] as const) {
      const result = compileSource(
        babelFrontend,
        { source, sourceId: `${name}.js` },
        { specialization },
      );
      assert.equal(result.mir, undefined);
      assert.ok(result.diagnostics.length > 0);
      assert.ok(result.diagnostics.every((d) => d.code === "OSEO0001"));
      assert.ok(result.diagnostics.every((d) => d.sourceId === `${name}.js`));
    }
  });
}

test("construction ordinary functions emit without source compilation", () => {
  for (const specialization of ["disabled", "enabled"] as const) {
    const result = compileSource(
      babelFrontend,
      {
        source: fixture.constructionStaticFixture.source,
        sourceId: "construction-static-contracts.js",
      },
      { specialization },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.mir != null);
    const mir = printMir(result.mir);
    assert.match(mir, /arguments/u);
    const emitted = cBackend.emit(result.mir).source;
    assert.match(emitted, /OseoResult/u);
  }
});

// Each mutation would print the same text without the fixture's strict checks.
const resultMutations = [
  ["duplicates", "return a;", 'return "3";'],
  ["names", "return eval;", 'return "4";'],
  ["identity", "return arguments[0];", "return String(arguments[0]);"],
  [
    "function",
    "sameValue(ordinary instanceof Function, true)",
    "sameValue(String(ordinary instanceof Function), true)",
  ],
  ["true result", "return true;", 'return "true";'],
  [
    "undefined result",
    "function empty() {}",
    'function empty() { return "undefined"; }',
  ],
  ["sum", "return arg1 + arg2 + arg3;", "return String(arg1 + arg2 + arg3);"],
] as const;

for (const [name, original, replacement] of resultMutations) {
  test(`construction rejects string result: ${name}`, () => {
    const source = fixture.constructionStaticFixture.source;
    assert.ok(source.includes(original));
    const mutated = source.replace(original, replacement);
    assert.throws(
      () => new Script(mutated).runInNewContext({ console: { log() {} } }),
      /construction result mismatch/u,
    );
  });
}
