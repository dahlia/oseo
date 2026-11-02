// Adapted from generated Test262 sources under
// test/language/eval-code/direct/, governed by its BSD license in
// node_modules/test262/LICENSE. No original inventory test is rewritten.

import type { Fixture } from "../fixture.ts";

const directory = "test/language/eval-code/direct/";
const bodies = {
  "func-decl": [
    "function arguments() {}",
    'assert.sameValue(typeof arguments, "function");',
  ],
  "lex-bind": [
    'let arguments = "local";',
    'assert.sameValue(arguments, "local");',
  ],
  "var-bind": [
    'var arguments = "local";',
    'assert.sameValue(arguments, "local");',
  ],
} as const;

type ScopeArgumentsFixture = Fixture & {
  readonly path: string;
  readonly expected: string;
};

function witness(
  kind: keyof typeof bodies,
  closure: boolean,
): ScopeArgumentsFixture {
  const name = `ds9-arguments-${kind}${closure ? "-closure" : ""}`;
  const path =
    `${directory}arrow-fn-body-cntns-arguments-${kind}-` +
    "arrow-func-declare-arguments-assign" +
    `${closure ? "-incl-def-param-arrow-arguments" : ""}.js`;
  const arrow = [
    `const f = (p = 0${closure ? ", q = () => arguments" : ""}) => {`,
    ...bodies[kind].map((line) => `  ${line}`),
    ...(closure ? ['  assert.sameValue(q(), "param");'] : []),
    "  count++;",
    "};",
    "f();",
  ];
  return {
    name,
    path,
    expected: `${name} ok\n`,
    source: [
      "// Static witness adapted from a pinned Test262 source.",
      "// Copyright and BSD terms: node_modules/test262/LICENSE.",
      "const assert = { sameValue(actual, expected, message) {",
      "  if (!Object.is(actual, expected)) throw new Error(message);",
      "} };",
      "const oldArguments = globalThis.arguments;",
      "let count = 0;",
      ...(closure
        ? [
            "((arguments) => {",
            ...arrow.map((line) => `  ${line}`),
            '})("param");',
          ]
        : arrow),
      'assert.sameValue(count, 1, "count");',
      "assert.sameValue(globalThis.arguments, oldArguments,",
      '  "globalThis.arguments unchanged");',
      `console.log(${JSON.stringify(`${name} ok`)});`,
      "",
    ].join("\n"),
  };
}

/**
 * Static witnesses for the six ds9 arrow cells. Each keeps the original
 * body binding, counter and global checks. The direct eval in a parameter
 * default becomes a plain default `p = 0`, so the arrow still has
 * parameter expressions and a body var environment of its own. In the
 * three cells that call `q()`, the value `"param"` comes from the
 * parameter of an enclosing arrow instead of the eval-created binding.
 * Like that binding, it lies outside both the parameter environment and
 * the body environment of `f`. No source evaluation occurs.
 */
export const scopeArgumentsFixtures: readonly ScopeArgumentsFixture[] = (
  ["func-decl", "lex-bind", "var-bind"] as const
).flatMap((kind) => [witness(kind, false), witness(kind, true)]);
