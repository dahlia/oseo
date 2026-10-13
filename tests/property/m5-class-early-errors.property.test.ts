import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import fc from "fast-check";

import { compileSource } from "../../packages/compiler/src/index.ts";
import {
  babelFrontend,
  babelModuleFrontend,
} from "../../packages/parser-babel/src/index.ts";

const { assertProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/** Structured class bodies retain constructor multiplicity while shrinking. */
interface ClassCase {
  readonly form: string;
  readonly constructors: readonly string[];
  readonly controls: readonly string[];
  readonly firstBody: string;
  readonly leadingMasker: string;
  readonly lineEnding: string;
  readonly prefixLines: number;
  readonly strict: boolean;
}

/** The second constructor's printed position is independent of conversion. */
interface PrintedClass {
  readonly source: string;
  readonly duplicateStart: number | undefined;
  readonly duplicateLength: number | undefined;
}

const spelling = fc.constantFrom(
  "constructor",
  '"constructor"',
  "'constructor'",
  "c\\u006fnstructor",
);
const control = fc.constantFrom(
  "method() {} method() {}",
  "static constructor() {}",
  '["constructor"]() {}',
  'get ["constructor"]() { return 1; }',
  'set ["constructor"](value) {}',
  '["constructor"] = 1;',
  'static ["constructor"] = 1;',
  "get value() {} set value(next) {}",
  "method() { class Inner { constructor() {} } }",
);

/** Construction guarantees admitted member syntax and no evaluation effects. */
function classCases(duplicate: boolean): fc.Arbitrary<ClassCase> {
  return fc.record({
    constructors: fc.array(spelling, {
      maxLength: duplicate ? 4 : 1,
      minLength: duplicate ? 2 : 0,
    }),
    controls: fc.array(control, { maxLength: 3 }),
    // Unsupported syntax before the duplicate must not mask the early error.
    firstBody: duplicate
      ? fc.constantFrom("", 'import("m");')
      : fc.constant(""),
    form: fc.constantFrom(
      "class Example",
      "const Example = class Named",
      "const Example = class",
    ),
    leadingMasker: duplicate
      ? fc.constantFrom("", 'static masked = import("m");')
      : fc.constant(""),
    lineEnding: fc.constantFrom("\n", "\r\n", "\u2028", "\u2029"),
    prefixLines: fc.integer({ max: 3, min: 0 }),
    strict: fc.boolean(),
  });
}

/** Print after generation so shrinking preserves constructor multiplicity. */
function printClass(testCase: ClassCase): PrintedClass {
  const newline = testCase.lineEnding;
  let source = testCase.strict ? `"use strict";${newline}` : "";
  source += `// Unicode prefix: \u03bb${newline}`.repeat(testCase.prefixLines);
  source += `${testCase.form} {${newline}`;
  if (testCase.leadingMasker !== "") {
    source += `  ${testCase.leadingMasker}${newline}`;
  }
  let duplicateStart: number | undefined;
  let duplicateLength: number | undefined;
  for (const [index, name] of testCase.constructors.entries()) {
    if (index === 1) {
      duplicateStart = source.length + 2;
      duplicateLength = `${name}() {}`.length;
    }
    const body =
      index === 0 && testCase.firstBody !== "" ? ` ${testCase.firstBody} ` : "";
    source += `  ${name}() {${body}}${newline}`;
    if (index === 0) {
      for (const element of testCase.controls) {
        source += `  ${element}${newline}`;
      }
    }
  }
  if (testCase.constructors.length === 0) {
    for (const element of testCase.controls) {
      source += `  ${element}${newline}`;
    }
  }
  return { duplicateLength, duplicateStart, source: `${source}}` };
}

/** Node checks syntax; Deno parses inert definitions through its own engine. */
function assertReferenceSyntax(source: string, valid: boolean): void {
  for (const [command, args, input] of [
    ["node", ["--check", "--input-type=commonjs"], source],
    ["deno", ["eval", "--ext=js", "--no-config", source], undefined],
  ] as const) {
    const result = spawnSync(command, args, { encoding: "utf8", input });
    assert.equal(result.error, undefined, command);
    assert.equal(result.signal, null, command);
    if (valid) {
      assert.equal(result.status, 0, `${command}: ${result.stderr}\n${source}`);
      assert.equal(result.stdout, "", command);
    } else {
      assert.notEqual(result.status, 0, `${command}: ${source}`);
      assert.match(result.stderr, /SyntaxError/u, `${command}: ${source}`);
    }
  }
}

test("reference syntax oracles retain static constructor methods", () => {
  assertReferenceSyntax(
    "class Example {\n  constructor() {}\n  static constructor() {}\n}",
    true,
  );
});

test("generated constructors and permitted elements remain valid", () => {
  assertProperty(
    "class constructor valid elements",
    fc.property(classCases(false), (testCase) => {
      const { source } = printClass(testCase);
      assertReferenceSyntax(source, true);
      const input = { source, sourceId: "generated-valid-class.js" };
      const script = babelFrontend.parse(input);
      const moduleResult = babelModuleFrontend.parseModule(input);
      assert.equal(script.parsed, true, source);
      assert.equal(moduleResult.parsed, true, source);
      assert.deepEqual(script.diagnostics, [], source);
      assert.deepEqual(moduleResult.diagnostics, [], source);
    }),
    {
      domain: "class-constructor-valid-elements",
      numRuns: 32,
      profile: "M5 class constructor early errors",
      seed: 0x6000_8700,
      sizeLimit: "one constructor, three permitted element groups",
      timeLimitMilliseconds: 120_000,
      context: [
        "Oracle: Node syntax check and Deno inert class definitions.",
        "Preconditions: zero or one constructor and permitted members.",
        "Shrinking preserves constructor count and self-contained scopes.",
      ],
    },
  );
});

test("generated duplicate constructors are located parse-phase errors", () => {
  assertProperty(
    "class constructor duplicate early error",
    fc.property(classCases(true), (testCase) => {
      const { duplicateLength, duplicateStart, source } = printClass(testCase);
      assertReferenceSyntax(source, false);
      assert.ok(duplicateStart != null && duplicateLength != null);
      const sourceId = "generated-duplicate-class.js";
      const input = { source, sourceId };
      const script = babelFrontend.parse(input);
      assert.equal(script.parsed, false, source);
      assert.equal(script.diagnostics.length, 1, source);
      const diagnostic = script.diagnostics[0];
      assert.ok(diagnostic != null);
      const encoder = new TextEncoder();
      const line = source
        .slice(0, duplicateStart)
        .split(/\r\n|[\r\n\u2028\u2029]/u).length;
      assert.deepEqual(diagnostic, {
        byteRange: {
          end: encoder.encode(source.slice(0, duplicateStart + duplicateLength))
            .length,
          start: encoder.encode(source.slice(0, duplicateStart)).length,
        },
        code: "OSEO0001",
        message: "A class defines one constructor.",
        range: {
          end: { column: 3 + duplicateLength, line },
          start: { column: 3, line },
        },
        sourceId,
      });
      const moduleResult = babelModuleFrontend.parseModule(input);
      assert.equal(moduleResult.parsed, false, source);
      assert.deepEqual(moduleResult.diagnostics, script.diagnostics, source);
      for (const specialization of ["enabled", "disabled"] as const) {
        const compiled = compileSource(babelFrontend, input, {
          specialization,
        });
        assert.equal(compiled.syntax, undefined, source);
        assert.equal(compiled.hir, undefined, source);
        assert.equal(compiled.mir, undefined, source);
        assert.deepEqual(compiled.diagnostics, script.diagnostics, source);
      }
    }),
    {
      domain: "class-constructor-duplicate-early-error",
      numRuns: 32,
      profile: "M5 class constructor early errors",
      seed: 0x6000_8701,
      sizeLimit:
        "two to four constructors, three permitted element groups, " +
        "an optional earlier unsupported field and first-body import",
      timeLimitMilliseconds: 120_000,
      context: [
        "Oracle: Node and Deno SyntaxError before class evaluation.",
        "Preconditions: at least two non-static constructor definitions.",
        "Mutation: add another constructor to an admitted class body.",
        "Masking: optional unsupported syntax precedes the duplicate.",
        "Shrinking retains two constructors and the duplicate's position.",
      ],
    },
  );
});
