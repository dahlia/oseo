import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cBackend } from "../packages/backend-c/src/index.ts";
import { compileSource } from "../packages/compiler/src/index.ts";
import { babelFrontend } from "../packages/parser-babel/src/index.ts";
import {
  traincFixtures,
  traincGroups,
  traincValueOracleFixture,
} from "./native/fixtures/trainc-ordinary-evidence.ts";

const statements = "test/language/statements/";

/** Caller-local direct eval environments; no source-free witness exists. */
const keptPaths = [
  "for/scope-body-var-none.js",
  "for/scope-head-var-none.js",
  "function/S13.2.2_A14.js",
  "function/eval-var-scope-syntax-err.js",
  "function/scope-body-lex-distinct.js",
  "function/scope-param-elem-var-close.js",
  "function/scope-param-elem-var-open.js",
  "function/scope-param-rest-elem-var-close.js",
  "function/scope-param-rest-elem-var-open.js",
  "generators/eval-var-scope-syntax-err.js",
  "generators/scope-body-lex-distinct.js",
  "generators/scope-param-elem-var-close.js",
  "generators/scope-param-elem-var-open.js",
  "generators/scope-param-rest-elem-var-close.js",
  "generators/scope-param-rest-elem-var-open.js",
  "switch/scope-var-none-case.js",
  "switch/scope-var-none-dflt.js",
  "variable/12.2.1-11.js",
].map((path) => statements + path);

/** Nested strict bodies whose run-time parse must fail like the original. */
const strictBodies = new Set(["'use strict'; eval = 42; "]);

test("train C selector splits into 26 witnessed and 18 kept paths", () => {
  const selected = readFileSync(
    new URL(
      "../docs/m5c-graph/dynamic-source-trainc-ordinary-evidence.paths.txt",
      import.meta.url,
    ),
    "utf8",
  )
    .trim()
    .split("\n");
  const witnessed = traincGroups.flatMap((group) => group.paths);
  assert.equal(witnessed.length, 26);
  assert.equal(new Set(witnessed).size, 26);
  assert.equal(keptPaths.length, 18);
  assert.ok(keptPaths.every((path) => !witnessed.includes(path)));
  assert.deepEqual([...witnessed, ...keptPaths].toSorted(), selected);
});

test("train C mutations each change their program exactly once", () => {
  for (const group of traincGroups) {
    for (const mutation of group.mutations) {
      assert.equal(group.program.split(mutation.from).length, 2, mutation.from);
    }
  }
});

for (const fixture of [...traincFixtures, traincValueOracleFixture]) {
  test(`train C finite Script structure: ${fixture.name}`, () => {
    // Witnesses never construct source; every Script is a build-time literal.
    assert.doesNotMatch(fixture.source, /\beval\s*\(|\bFunction\s*\(/u);
    for (const specialization of ["disabled", "enabled"] as const) {
      const compiled = compileSource(
        babelFrontend,
        { source: fixture.source, sourceId: `${fixture.name}.js` },
        { specialization, test262Host: true },
      );
      assert.deepEqual(compiled.diagnostics, []);
      const scripts = compiled.mir!.test262Host!.scripts!;
      assert.ok(scripts.length > 0);
      for (const script of scripts) {
        if (strictBodies.has(script.source)) {
          assert.equal(script.error, "syntax");
        } else {
          assert.equal(script.error, undefined, script.source.slice(0, 80));
        }
      }
      if (fixture.name === "trainc-constructor-phase") {
        assert.ok(scripts.some((script) => script.error === "syntax"));
      }
      assert.match(cBackend.emit(compiled.mir!).source, /oseo_host_scripts/u);
    }
  });
}

// The constructed bodies are sloppy whatever the caller's mode; the same
// bodies under a strict directive are early errors.
const sloppyBodies = [
  "var eval;",
  "var arguments;",
  "eval = 42;",
  "arguments = 42;",
];

for (const body of sloppyBodies) {
  test(`train C body grammar: ${body}`, () => {
    for (const specialization of ["disabled", "enabled"] as const) {
      const options = { specialization } as const;
      const sloppy = compileSource(
        babelFrontend,
        { source: `function f() { ${body} }`, sourceId: "sloppy.js" },
        options,
      );
      assert.deepEqual(sloppy.diagnostics, []);
      assert.ok(sloppy.mir != null);
      for (const source of [
        `function f() { "use strict"; ${body} }`,
        `"use strict"; function f() { ${body} }`,
      ]) {
        const strict = compileSource(
          babelFrontend,
          { source, sourceId: "strict.js" },
          options,
        );
        assert.deepEqual(
          strict.diagnostics.map((diagnostic) => diagnostic.code),
          ["OSEO0001"],
        );
      }
    }
  });
}
