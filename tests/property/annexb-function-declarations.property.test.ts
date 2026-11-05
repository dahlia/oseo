/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";
import { createContext, Script } from "node:vm";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import { babelFrontend } from "../../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../../packages/testkit/src/index.ts";
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/*
 * Each generated case places one ordinary function declaration under a
 * stack of statements and reads the declared name before and after them.
 * The expected values come from the independent model below, written from
 * Annex B.3.2 and B.3.4 rather than from the implementation: whether a
 * `var` of the name at the declaration would be an early error, whether
 * a parameter or strict code excludes it, and whether the declaration's
 * statement list actually runs.
 */

type Scope = "function" | "script";
type Top = "function" | "let" | "none" | "var";
type Parameter = "default" | "none" | "simple";
type Site = "block" | "if" | "switch";
type Wrapper =
  | "block"
  | "catch-pattern"
  | "catch-simple"
  | "for-let"
  | "for-let-same"
  | "if"
  | "label"
  | "let-block"
  | "try"
  | "with";

interface DeclarationCase {
  readonly parameter: Parameter;
  /** Whether an `if` or `switch` site takes the declaration's branch. */
  readonly runs: boolean;
  readonly scope: Scope;
  readonly site: Site;
  readonly strict: boolean;
  readonly top: Top;
  /** Enclosing statements, outermost first. */
  readonly wrappers: readonly Wrapper[];
}

/** Wrappers whose binding makes a `var` of the name an early error. */
const conflictingWrappers: ReadonlySet<Wrapper> = new Set([
  "catch-pattern",
  "for-let-same",
  "let-block",
]);

const wrapperArbitrary = fc.constantFrom<Wrapper>(
  "block",
  "catch-pattern",
  "catch-simple",
  "for-let",
  "for-let-same",
  "if",
  "label",
  "let-block",
  "try",
  "with",
);

const caseArbitrary: fc.Arbitrary<DeclarationCase> = fc
  .record({
    parameter: fc.constantFrom<Parameter>("default", "none", "simple"),
    runs: fc.boolean(),
    scope: fc.constantFrom<Scope>("function", "script"),
    site: fc.constantFrom<Site>("block", "if", "switch"),
    strict: fc.boolean(),
    top: fc.constantFrom<Top>("function", "let", "none", "var"),
    wrappers: fc.array(wrapperArbitrary, { maxLength: 3 }),
  })
  .map((generated) => {
    // A Script case is non-strict and has no parameters. Strict code has
    // no `with` and no if-clause function declarations, and a parameter
    // name cannot also be a top-level `let`.
    const script = generated.scope === "script";
    const strict = !script && generated.strict;
    // A "use strict" directive also needs a simple parameter list.
    const parameter = script
      ? "none"
      : strict && generated.parameter === "default"
        ? "simple"
        : generated.parameter;
    return {
      parameter,
      runs: generated.runs,
      scope: generated.scope,
      site: strict && generated.site === "if" ? "block" : generated.site,
      strict,
      top:
        parameter !== "none" && generated.top === "let" ? "var" : generated.top,
      wrappers: strict
        ? generated.wrappers.filter((wrapper) => wrapper !== "with")
        : generated.wrappers,
    };
  });

/** The value tag a read of the name prints. */
type Tag =
  | "block"
  | "let"
  | "param"
  | "ReferenceError"
  | "top"
  | "undefined"
  | "var";

interface Modeled {
  readonly end: Tag;
  /** Whether a Script case's name is an own global-object property. */
  readonly global?: boolean;
  readonly start: Tag;
}

function model(testCase: DeclarationCase): Modeled {
  const qualifies =
    !testCase.strict &&
    testCase.parameter === "none" &&
    testCase.top !== "let" &&
    !testCase.wrappers.some((wrapper) => conflictingWrappers.has(wrapper));
  // Every wrapper runs its body once, so only the site decides.
  const runs = testCase.site === "block" || testCase.runs;
  let start: Tag;
  if (testCase.top === "function") start = "top";
  else if (testCase.top === "var") start = "var";
  else if (testCase.top === "let") start = "let";
  else if (testCase.parameter !== "none") start = "param";
  else start = qualifies ? "undefined" : "ReferenceError";
  const end = qualifies && runs ? "block" : start;
  if (testCase.scope === "function") return { end, start };
  return {
    end,
    global: testCase.top === "var" || testCase.top === "function" || qualifies,
    start,
  };
}

function wrap(wrapper: Wrapper, name: string, label: string, inner: string) {
  switch (wrapper) {
    case "block":
      return `{ ${inner} }`;
    case "catch-pattern":
      return `try { throw {}; } catch ({ ${name} }) { ${inner} }`;
    case "catch-simple":
      return `try { throw "caught"; } catch (${name}) { ${inner} }`;
    case "for-let":
      return `for (let k${label} = 0; k${label} < 1; k${label}++) { ${inner} }`;
    case "for-let-same":
      return `for (let ${name} = 0; ${name} < 1; ${name}++) { ${inner} }`;
    case "if":
      return `if (true) { ${inner} }`;
    case "label":
      return `label${label}: { ${inner} }`;
    case "let-block":
      return `{ let ${name} = "inner"; ${inner} }`;
    case "try":
      return `try { ${inner} } finally {}`;
    case "with":
      return `with ({}) { ${inner} }`;
  }
}

function printCase(testCase: DeclarationCase, index: number): string {
  const name = `annexbF${index}`;
  const declaration = `function ${name}() { return "block"; }`;
  const condition = testCase.runs ? "true" : "false";
  let statement =
    testCase.site === "block"
      ? `{ ${declaration} }`
      : testCase.site === "if"
        ? `if (${condition}) ${declaration}`
        : `switch (${condition} ? 0 : 1) { case 0: ${declaration} }`;
  for (const [depth, wrapper] of [
    ...testCase.wrappers.entries(),
  ].toReversed()) {
    statement = wrap(wrapper, name, `${index}_${depth}`, statement);
  }
  const top =
    testCase.top === "function"
      ? `function ${name}() { return "top"; }`
      : testCase.top === "var"
        ? `var ${name} = "var";`
        : testCase.top === "let"
          ? `let ${name} = "let";`
          : "";
  const body = [
    top,
    `report(${index}, "start", function () { return ${name}; });`,
    statement,
    `report(${index}, "end", function () { return ${name}; });`,
  ];
  if (testCase.scope === "script") {
    body.push(
      `console.log(${index}, "global", ` +
        `Object.prototype.hasOwnProperty.call(globalThis, "${name}"));`,
    );
    return body.join("\n");
  }
  const parameter =
    testCase.parameter === "simple"
      ? name
      : testCase.parameter === "default"
        ? `${name} = "param"`
        : "";
  return [
    `(function (${parameter}) {`,
    testCase.strict ? '"use strict";' : "",
    ...body,
    `})(${testCase.parameter === "simple" ? '"param"' : ""});`,
  ].join("\n");
}

const prelude = `
function report(index, point, read) {
  var tag;
  try {
    var value = read();
    tag = typeof value === "function" ? value() : String(value);
  } catch (error) {
    tag = error.name;
  }
  console.log(index, point, tag);
}
`;

function printProgram(cases: readonly DeclarationCase[]): string {
  return prelude + cases.map(printCase).join("\n");
}

function expectedOutput(cases: readonly DeclarationCase[]): string {
  return cases
    .map((testCase, index) => {
      const modeled = model(testCase);
      const lines = [
        `${index} start ${modeled.start}`,
        `${index} end ${modeled.end}`,
      ];
      if (modeled.global != null)
        lines.push(`${index} global ${modeled.global}`);
      return lines.join("\n") + "\n";
    })
    .join("");
}

/** The output of V8 running the program as a Script in a fresh realm. */
function v8Output(source: string): string {
  const lines: string[] = [];
  const context = createContext({
    console: {
      log: (...values: unknown[]) => lines.push(values.map(String).join(" ")),
    },
  });
  new Script(source).runInContext(context);
  return lines.map((line) => `${line}\n`).join("");
}

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

test("the Annex B model follows the edition's skip rules", () => {
  const base: DeclarationCase = {
    parameter: "none",
    runs: true,
    scope: "function",
    site: "block",
    strict: false,
    top: "none",
    wrappers: [],
  };
  assert.deepEqual(model(base), { end: "block", start: "undefined" });
  assert.deepEqual(model({ ...base, strict: true }), {
    end: "ReferenceError",
    start: "ReferenceError",
  });
  assert.deepEqual(model({ ...base, parameter: "simple" }), {
    end: "param",
    start: "param",
  });
  assert.deepEqual(model({ ...base, wrappers: ["catch-simple"] }), {
    end: "block",
    start: "undefined",
  });
  assert.deepEqual(model({ ...base, wrappers: ["catch-pattern"] }), {
    end: "ReferenceError",
    start: "ReferenceError",
  });
  assert.deepEqual(model({ ...base, runs: false, site: "switch" }), {
    end: "undefined",
    start: "undefined",
  });
  assert.deepEqual(model({ ...base, scope: "script", top: "let" }), {
    end: "let",
    global: false,
    start: "let",
  });
});

test(
  "generated Annex B function declarations match the model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "block-level function bindings follow Annex B.3.2",
      fc.asyncProperty(
        fc.array(caseArbitrary, { maxLength: 4, minLength: 1 }),
        async (cases) => {
          const source = printProgram(cases);
          const expected = {
            exitStatus: 0,
            stderr: "",
            stdout: expectedOutput(cases),
          };
          // The generator avoids every form where V8 departs from the
          // edition, so V8 running the program as a Script must agree.
          assert.equal(v8Output(source), expected.stdout, source);
          for (const specialization of ["disabled", "enabled"] as const) {
            const compiled = compileSource(
              babelFrontend,
              { source, sourceId: "generated-annexb-functions.js" },
              { specialization },
            );
            assert.deepEqual(compiled.diagnostics, [], source);
            assert.ok(compiled.mir != null);
            process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
            try {
              await withNativeFixture(
                {
                  backend: cBackend,
                  host,
                  input: compiled.mir,
                  operation: "execute",
                  runtime: cRuntimeProvider,
                  target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
                  toolchain: nativeToolchain,
                },
                (native) => assertMatchingObservations([expected, native]),
              );
            } finally {
              delete process.env.OSEO_GC_EVERY_SAFEPOINT;
            }
          }
        },
      ),
      {
        context:
          nativeTarget == null || host.executionHost == null
            ? ["target=unsupported host=unknown"]
            : [
                `target=${nativeTarget.name}`,
                `host=${host.executionHost.operatingSystem}/` +
                  host.executionHost.architecture,
                `sanitizers=${nativeTarget.sanitizers.join(",")}`,
              ],
        domain:
          "block, if-clause, and switch-clause function declarations in " +
          "function and Script code under blocks, try, catch, for-let, " +
          "labels, lexical blocks, and with, with parameters, top-level " +
          "var, let, and function declarations, and strict bodies",
        numRuns: 12,
        profile: "Annex B block-level function declarations",
        seed: 0x6000_a200,
        sizeLimit: "four declarations per program, three wrappers each",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
