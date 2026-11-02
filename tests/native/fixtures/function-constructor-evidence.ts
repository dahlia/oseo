import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Fixture } from "../fixture.ts";

const harness = readFileSync(
  new URL("../../test262/harness/base.js", import.meta.url),
  "utf8",
);

/**
 * One pinned original whose single source-compiling call expression is
 * replaced. Every other byte after the frontmatter, including each
 * assertion, is kept.
 */
export interface ConstructorWitness {
  readonly name: string;
  readonly original: string;
  readonly digest: string;
  readonly strictness: readonly ("non-strict" | "strict")[];
  readonly call: string;
  readonly replacement: string;
  /** Checks the replacement uses; they throw the realm's Test262Error. */
  readonly prelude: string;
  /** Each mutation must make an original assertion or a check throw. */
  readonly mutations: readonly (readonly [string, string])[];
}

/** Read one pinned original file from the reviewed test262 checkout. */
export function functionConstructorOriginal(path: string): string {
  return readFileSync(
    new URL(path, import.meta.resolve("test262/package.json")),
    "utf8",
  );
}

const parameterCheck = `function __fcParameters(actual, expected, created) {
  if (actual !== expected || typeof actual !== typeof expected)
    throw new Test262Error("parameter string value/type");
  return created;
}
`;

export const functionConstructorWitnesses: readonly ConstructorWitness[] = [
  {
    // Function receives only String values here. The parameter string is
    // computed once, before the body, and compared strictly; a static
    // function with those parameters and that body replaces the result.
    name: "fc-string-parameters",
    original: "test/built-ins/Function/S15.3.2.1_A2_T6.js",
    digest: "c40f7e8b897d378bd60b35ded52bb10111830b19778b15ef80b3a3d542856e11",
    strictness: ["non-strict", "strict"],
    call: 'Function(p + "," + p + "," + p, "return arg1+arg2+arg3;")',
    replacement:
      '__fcParameters(p + "," + p + "," + p, "arg1,arg2,arg3", ' +
      "function (arg1,arg2,arg3) {\nreturn arg1+arg2+arg3;\n})",
    prelude: parameterCheck,
    mutations: [
      ['return "arg" + (++i)\n', 'return "arg" + (i++)\n'],
      ["return arg1+arg2+arg3;\n}", "return arg1+arg3+arg2;\n}"],
      [
        "function (arg1,arg2,arg3) {\nreturn arg1+arg2+arg3;\n}",
        "Object.setPrototypeOf(function (arg1,arg2,arg3) {\n" +
          "return arg1+arg2+arg3;\n}, null)",
      ],
      ['f("", 1, p)', 'f("", "1", 1)'],
    ],
  },
  {
    // The method reads super.test262 itself instead of through eval code,
    // before and after its home object's prototype changes.
    name: "fc-super-property-method",
    original: "test/language/eval-code/direct/super-prop-method.js",
    digest: "681dc9a1a2d545b77eea0d557c7c646535633a62b1da19794eeccbd3b9dfa8cf",
    strictness: ["non-strict", "strict"],
    call: "eval('super.test262;')",
    replacement: "super.test262",
    prelude: "",
    mutations: [
      ["superProp = super.test262;", "superProp = this.test262;"],
      ["Object.setPrototypeOf(o, { test262: 262 });", ""],
      ["{ test262: 262 }", '{ test262: "262" }'],
    ],
  },
  {
    // The direct eval runs in global code, reads nothing of the caller,
    // and the original is non-strict, so a literal host Script of the same
    // source replaces it.
    name: "fc-with-scope-var-open",
    original: "test/language/statements/with/scope-var-open.js",
    digest: "59ed9f1509259ae4296f32a82dfaef31d1d05b9db449bec9253b19ca16f80e2c",
    strictness: ["non-strict"],
    call: "eval('var x = 1;')",
    replacement: "$262.evalScript('var x = 1;')",
    prelude: "",
    mutations: [
      ["$262.evalScript('var x = 1;')", "$262.evalScript('var x = 5;')"],
      ["var x = 3, _ =", "x = 3; var _ ="],
      [
        "probeExpr = function() { return x; }",
        "probeExpr = function() { return objectRecord.x; }",
      ],
    ],
  },
];

/** The original body after its frontmatter with only the call replaced. */
export function functionConstructorWitnessSource(
  witness: ConstructorWitness,
): string {
  const original = functionConstructorOriginal(witness.original);
  const digest = createHash("sha256").update(original).digest("hex");
  if (digest !== witness.digest) {
    throw new Error(`${witness.original} changed: ${digest}`);
  }
  const body = original.slice(original.indexOf("---*/") + "---*/".length);
  if (body.split(witness.call).length !== 2) {
    throw new Error(`${witness.original} needs exactly one ${witness.call}`);
  }
  const replaced = body.replace(witness.call, witness.replacement);
  if (/\b(?:eval|Function)\s*\(/u.test(replaced)) {
    throw new Error(`${witness.original} keeps a source-compiling call`);
  }
  return witness.prelude + replaced;
}

/**
 * Each variant runs in its own realm with the test262 harness. The
 * unmutated program must complete; each mutation must throw that realm's
 * Test262Error, so the verdict needs only error identity.
 */
function witnessFixture(witness: ConstructorWitness): Fixture {
  const source = functionConstructorWitnessSource(witness);
  const lines: string[] = [];
  let index = 0;
  for (const strictness of witness.strictness) {
    const prefix = strictness === "strict" ? '"use strict";\n' : "";
    const variants = [
      source,
      ...witness.mutations.map(([original, replacement]) => {
        if (source.split(original).length !== 2) {
          throw new Error(`${witness.name}: mutation site ${original}`);
        }
        return source.replace(original, replacement);
      }),
    ];
    for (const [variant, program] of variants.entries()) {
      const realm = `realm_${index++}`;
      lines.push(
        `const ${realm} = $262.createRealm();`,
        `${realm}.evalScript(${JSON.stringify(harness)});`,
      );
      const script = JSON.stringify(prefix + program);
      const invoke = `${realm}.evalScript(${script});`;
      if (variant === 0) lines.push(invoke);
      else
        lines.push(
          `let rejected_${realm} = false;`,
          "try {",
          invoke,
          "} catch (error) {",
          `if (!(error instanceof ${realm}.global.Test262Error))` +
            " throw error;",
          `rejected_${realm} = true;`,
          "}",
          `if (!rejected_${realm}) throw new Error("mutation survived");`,
        );
    }
  }
  lines.push(`console.log(${JSON.stringify(`${witness.name} ok`)});`);
  return {
    name: witness.name,
    source: lines.join("\n"),
    test262Host: true,
  };
}

export const functionConstructorFixtures: readonly Fixture[] =
  functionConstructorWitnesses.map(witnessFixture);
