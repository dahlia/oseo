import { readFileSync } from "node:fs";
import type { Fixture } from "../fixture.ts";

const harness = readFileSync(
  new URL("../../test262/harness/base.js", import.meta.url),
  "utf8",
);

/** Strict value and type comparator shared by every witness. */
export const compoundReferenceBaseCheck = `function check(actual, expected) {
  if (actual !== expected || typeof actual !== typeof expected)
    throw new Test262Error("compound reference base value/type");
}\n`;

/**
 * One S11.13.2_A6.N_T1 row. The original declares a more local `x` through
 * direct eval while the right operand runs; the witness adds `x` to a `with`
 * object at the same point instead.
 */
export interface CompoundReferenceBaseCase {
  readonly path: string;
  readonly operator: string;
  readonly initial: number;
  readonly operand: number;
  /** Value the original asserts for the outer `x`. */
  readonly expected: number;
}

const directory = "test/language/expressions/compound-assignment/";

export const compoundReferenceBaseCases: readonly CompoundReferenceBaseCase[] =
  (
    [
      [1, "*=", 3, 4, 12],
      [2, "/=", 15, 3, 5],
      [3, "%=", 7, 4, 3],
      [4, "+=", 3, 1, 4],
      [5, "-=", 5, 1, 4],
      [6, "<<=", 1, 3, 8],
      [7, ">>=", 8, 1, 4],
      [8, ">>>=", 8, 1, 4],
      [9, "&=", 5, 3, 1],
      [10, "^=", 1, 4, 5],
      [11, "|=", 1, 4, 5],
    ] as const
  ).map(([n, operator, initial, operand, expected]) => ({
    path: `${directory}S11.13.2_A6.${n}_T1.js`,
    operator,
    initial,
    operand,
    expected,
  }));

/**
 * The sloppy witness program for one row. The reference to `x` is resolved
 * while `scope` has no `x`, so it names the function's `x`; the right
 * operand then adds `scope.x`. The original's two assertions become
 * `check(innerX, 2)` and `check(x, expected)`, and `check(scope.x, 2)`
 * confirms that PutValue did not write the newer binding.
 */
export function compoundReferenceBaseProgram(
  entry: CompoundReferenceBaseCase,
): string {
  return `function testCompoundAssignment() {
  var x = ${entry.initial};
  var scope = {};
  var innerX = (function () {
    with (scope) {
      x ${entry.operator} (scope.x = 2, ${entry.operand});
      return x;
    }
  })();
  check(innerX, 2);
  check(x, ${entry.expected});
  check(scope.x, 2);
}
testCompoundAssignment();
`;
}

/**
 * Each mutation must make the unchanged checks throw Test262Error. The
 * first adds the binding before the reference is resolved, so `scope.x`
 * receives the result. The second never adds it, so `innerX` reads the
 * function's `x`.
 */
export function compoundReferenceBaseMutations(
  entry: CompoundReferenceBaseCase,
): readonly { readonly from: string; readonly to: string }[] {
  const site = `x ${entry.operator} (scope.x = 2, ${entry.operand});`;
  return [
    {
      from: site,
      to: `scope.x = 2; x ${entry.operator} ${entry.operand};`,
    },
    { from: site, to: `x ${entry.operator} (0, ${entry.operand});` },
  ];
}

const prelude = harness + compoundReferenceBaseCheck;

/**
 * Every row's witness runs as its own Script in one sloppy realm. Each
 * mutation runs as its own Script in a second realm and must reject with
 * that realm's Test262Error.
 */
export const compoundReferenceBaseFixture: Fixture = {
  name: "compound-reference-base",
  test262Host: true,
  source: [
    "const witnesses = $262.createRealm();",
    "const mutants = $262.createRealm();",
    `witnesses.evalScript(${JSON.stringify(prelude)});`,
    `mutants.evalScript(${JSON.stringify(prelude)});`,
    ...compoundReferenceBaseCases.flatMap((entry, row) => {
      const program = compoundReferenceBaseProgram(entry);
      const lines = [`witnesses.evalScript(${JSON.stringify(program)});`];
      for (const [index, mutation] of compoundReferenceBaseMutations(
        entry,
      ).entries()) {
        const id = `${row}_${index + 1}`;
        const mutated = program.replace(mutation.from, mutation.to);
        if (mutated === program) throw new Error(`unchanged mutation ${id}`);
        lines.push(
          `let rejected_${id} = false;`,
          "try {",
          `mutants.evalScript(${JSON.stringify(mutated)});`,
          "} catch (error) {",
          "if (!(error instanceof mutants.global.Test262Error)) throw error;",
          `rejected_${id} = true;`,
          "}",
          `if (!rejected_${id}) throw new Error("mutation survived");`,
        );
      }
      return lines;
    }),
    'console.log("compound-reference-base ok");',
  ].join("\n"),
};
