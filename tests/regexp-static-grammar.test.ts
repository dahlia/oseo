import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { cBackend } from "../packages/backend-c/src/index.ts";
const { regexpStaticEvidenceFixtures } =
  await import("./native/fixtures/regexp-static-evidence.ts");
import { defaultComponents } from "../packages/cli/src/index.ts";
import { compileSource } from "../packages/compiler/src/index.ts";

test("replacement fixture passes its oracle controls", () => {
  const fixture = regexpStaticEvidenceFixtures[0];
  assert.ok(fixture);
  const output: string[] = [];
  runInNewContext(fixture.source, {
    console: { log: (value: string) => output.push(value) },
  });
  assert.deepEqual(output, ["regexp static evidence passed"]);
});

for (const comparator of [
  "true",
  '(typeof actual === "number" && typeof expected === "number") || ' +
    "Object.is(actual, expected)",
]) {
  test(`oracle controls reject comparator: ${comparator}`, () => {
    const fixture = regexpStaticEvidenceFixtures[0];
    assert.ok(fixture);
    const source = fixture.source.replace(
      "check(Object.is(actual, expected));",
      `check(${comparator});`,
    );
    assert.notEqual(source, fixture.source);
    const output: string[] = [];
    assert.throws(
      () =>
        runInNewContext(source, {
          console: { log: (value: string) => output.push(value) },
        }),
      /static regexp evidence failed/u,
    );
    assert.deepEqual(output, []);
  });
}

// These are build inputs, never strings evaluated by the produced program.
// A constructor cannot witness the lexical grammar of a regexp literal.
for (const [name, character] of [
  ["LF", "\n"],
  ["CR", "\r"],
  ["LS", "\u2028"],
  ["PS", "\u2029"],
] as const) {
  for (const prefix of ["", "a", "\\", "a\\"]) {
    test(`literal rejects ${name} after ${JSON.stringify(prefix)}`, () => {
      for (const strict of [false, true]) {
        const source =
          `${strict ? '"use strict";\n' : ""}` +
          `const pattern = /${prefix}${character}/;`;
        const result = compileSource(defaultComponents.frontend, {
          source,
          sourceId: "regexp-static-negative.js",
        });
        assert.equal(result.mir, undefined);
        assert.ok(result.diagnostics.length > 0);
        assert.ok(result.diagnostics.every((d) => d.code === "OSEO0001"));
      }
    });
  }
}

for (const codeUnit of [0xd801, 0xdca4]) {
  for (const flag of ["", "u"]) {
    const name = `surrogate ${codeUnit.toString(16)} with ${flag}`;
    test(`literal rejects ${name}`, () => {
      const group = "a" + String.fromCharCode(codeUnit);
      const source = `const pattern = /(?<${group}>.)/${flag};`;
      const result = compileSource(defaultComponents.frontend, {
        source,
        sourceId: "regexp-static-groupname.js",
      });
      assert.equal(result.mir, undefined);
      assert.ok(result.diagnostics.length > 0);
      assert.ok(result.diagnostics.every((d) => d.code === "OSEO0001"));
    });
  }
}

// The distinct CR followed by n subject in 7.8.5-1.js.
test("literal rejects escaped CR followed by n", () => {
  const result = compileSource(defaultComponents.frontend, {
    source: "/\\\rn/;",
    sourceId: "regexp-static-cr.js",
  });
  assert.equal(result.mir, undefined);
  assert.ok(result.diagnostics.some((d) => d.code === "OSEO0001"));
});

// Literal spelling produced by the native fixture's source accessor checks.
for (const [pattern, flags] of [
  ["(?:)", ""],
  ["\\n", ""],
  ["\\/", ""],
  ["\\ud834\\udf06", "u"],
  ["\\u{1d306}", "u"],
  ["ab{2,4}c$", ""],
]) {
  test(`source output builds a static literal: ${pattern}/${flags}`, () => {
    const result = compileSource(defaultComponents.frontend, {
      source: `const pattern = /${pattern}/${flags};`,
      sourceId: "regexp-static-roundtrip.js",
    });
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.mir);
    const literals = result.mir.script.blocks.flatMap((block) =>
      block.operations.filter(
        (operation) => operation.kind === "regexp-literal",
      ),
    );
    assert.equal(literals.length, 1);
    assert.equal(literals[0]?.regexpProgram?.source, pattern);
    assert.equal(literals[0]?.regexpProgram?.flags.text, flags);
  });
}

test("replacement fixture emits static literal descriptors", () => {
  const fixture = regexpStaticEvidenceFixtures[0];
  assert.ok(fixture);
  const compiled = compileSource(defaultComponents.frontend, {
    source: fixture.source,
    sourceId: "regexp-static-evidence.js",
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir);
  const emitted = cBackend.emit(compiled.mir).source;
  assert.match(emitted, /const OseoRegExpLiteral/u);
  assert.doesNotMatch(fixture.source, /\b(?:eval|Function)\s*\(/u);
});

// A2.3_T6 spells its preceding atom s rather than a.
test("literal rejects PS after s", () => {
  const result = compileSource(defaultComponents.frontend, {
    source: "/s\u2029/;",
    sourceId: "regexp-static-ps.js",
  });
  assert.equal(result.mir, undefined);
  assert.ok(result.diagnostics.some((d) => d.code === "OSEO0001"));
});
