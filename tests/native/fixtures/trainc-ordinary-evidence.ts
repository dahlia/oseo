import { readFileSync } from "node:fs";
import type { Fixture } from "../fixture.ts";

const harness = readFileSync(
  new URL("../../test262/harness/base.js", import.meta.url),
  "utf8",
);

/** Strict value and type comparator shared by every train C witness. */
export const traincCheck = `function check(actual, expected) {
  if (actual !== expected || typeof actual !== typeof expected)
    throw new Test262Error("trainc value/type");
}\n`;

/**
 * One train C witness group. Each variant runs in a fresh realm after the
 * harness, the comparator and an always-sloppy prelude. A mutation replaces
 * the exact `from` text of the program once; its realm must reject it with
 * that realm's Test262Error, a verdict independent of `check`.
 */
export interface TraincGroup {
  readonly name: string;
  /** The exact pinned test262 paths this group witnesses. */
  readonly paths: readonly string[];
  /** Caller strictness modes in which the program runs. */
  readonly modes: readonly ("sloppy" | "strict")[];
  /** Sloppy static callables that replace sloppy constructed bodies. */
  readonly sloppy: string;
  readonly program: string;
  readonly mutations: readonly {
    readonly from: string;
    readonly to: string;
  }[];
}

const statements = "test/language/statements/";

export const traincGroups: readonly TraincGroup[] = [
  {
    name: "trainc-strict-restricted",
    paths: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(
      (n) => `${statements}function/13.2-${n}-s.js`,
    ),
    modes: ["sloppy", "strict"],
    sloppy: "",
    // Function("'use strict';") and new Function("'use strict';") both
    // produce an ordinary strict function; a static strict function
    // expression replaces each, and the source construction stays excluded.
    program: `
var foo = function () { "use strict"; };
check(typeof foo, "function");
check(Object.prototype.hasOwnProperty.call(foo, "caller"), false);
check(Object.prototype.hasOwnProperty.call(foo, "arguments"), false);
assert.throws(TypeError, function () { var temp = foo.caller; });
assert.throws(TypeError, function () { foo.caller = 41; });
assert.throws(TypeError, function () { var temp = foo.arguments; });
assert.throws(TypeError, function () { foo.arguments = 41; });
var keys = [];
for (var tempIndex in foo) {
  keys.push(tempIndex);
  assert.notSameValue(tempIndex, "caller", "tempIndex");
  assert.notSameValue(tempIndex, "arguments", "tempIndex");
}
check(keys.length, 0);
var seen = [];
var self = function () {
  "use strict";
  for (var tempIndex in this) {
    seen.push(tempIndex);
    assert.notSameValue(tempIndex, "caller", "tempIndex");
    assert.notSameValue(tempIndex, "arguments", "tempIndex");
  }
};
self.call(self);
check(seen.length, 0);
`,
    mutations: [
      { from: "var temp = foo.caller;", to: "var temp = foo.length;" },
      { from: "foo.caller = 41;", to: "foo.callee = 41;" },
      { from: "var temp = foo.arguments;", to: "var temp = foo.name;" },
      { from: "foo.arguments = 41;", to: "foo.argument = 41;" },
      {
        from: "var keys = [];",
        to:
          "var keys = []; Object.defineProperty(foo, 'caller'," +
          " { value: 1, enumerable: true });",
      },
      {
        from: "self.call(self);",
        to:
          "Object.defineProperty(self, 'arguments'," +
          " { value: 1, enumerable: true }); self.call(self);",
      },
    ],
  },
  {
    name: "trainc-sloppy-body-effects",
    paths: [
      `${statements}function/13.0-12-s.js`,
      `${statements}function/13.0-17-s.js`,
      `${statements}function/S13.2.2_A8_T3.js`,
      `${statements}variable/12.2.1-17-s.js`,
      `${statements}variable/12.2.1-6-s.js`,
    ],
    modes: ["sloppy", "strict"],
    // A constructed body is sloppy whatever the caller's mode. That rule is
    // source construction; these sloppy callables witness the executed body.
    // The short name keeps the 13.0-17-s host Script literal on one line.
    sloppy: `
var mkEval = function () { return function () { eval = 42; }; };
var makeArgumentsAssign = function () {
  return function () { arguments = 42; return arguments; };
};
`,
    program: `
var original = Object.getOwnPropertyDescriptor(globalThis, "eval");
check(typeof original.value, "function");
check(original.writable, true);
check(original.enumerable, false);
check(original.configurable, true);
function restoreEval() {
  Object.defineProperty(globalThis, "eval", original);
  check(typeof globalThis.eval, "function");
}
var _13_0_12_fun = mkEval();
_13_0_12_fun();
check(globalThis.eval, 42);
restoreEval();
var f = mkEval();
f();
check(globalThis.eval, 42);
restoreEval();
$262.evalScript("'use strict'; var _13_0_17_fun = mkEval(); _13_0_17_fun();");
check(globalThis.eval, 42);
restoreEval();
var g = makeArgumentsAssign();
check(g(), 42);
check(typeof globalThis.arguments, "undefined");
var __FRST = "one";
var __SCND = "two";
var __func = function (arg1, arg2) {
  this.first = arg1;
  var __gunc = function (arg) { return ++arg; };
  __gunc.prop = arg2;
  return __gunc;
};
var __instance = new __func(__FRST, __SCND);
check(typeof __instance, "function");
check(__instance.first, undefined);
check(__instance.prop, __SCND);
check(__instance(1), 2);
`,
    mutations: [
      { from: "_13_0_12_fun();", to: "void _13_0_12_fun;" },
      { from: "\nf();", to: "\nvoid f;" },
      { from: " _13_0_17_fun();", to: " void _13_0_17_fun;" },
      {
        from: "var g = makeArgumentsAssign();",
        to: 'var g = function () { return "42"; };',
      },
      { from: "return __gunc;", to: "return undefined;" },
      { from: "__gunc.prop = arg2;", to: "__gunc.prop = arg1;" },
      { from: "return ++arg;", to: "return arg + '1';" },
    ],
  },
  {
    name: "trainc-constructor-phase",
    paths: [
      `${statements}function/13.0-13-s.js`,
      `${statements}function/13.0-14-s.js`,
      `${statements}function/13.0_4-17gs.js`,
      `${statements}variable/12.2.1-16-s.js`,
      `${statements}variable/12.2.1-5-s.js`,
    ],
    modes: ["sloppy", "strict"],
    // Sloppy bodies that the original constructs but never calls. Their
    // acceptance is also witnessed by the static grammar test.
    sloppy: `
var acceptVarEval = function () { var eval; };
var acceptVarArguments = function () { var arguments; };
var acceptEvalAssign = function () { eval = 42; };
`,
    // A nested literal host Script parses the strict body at run time, as
    // CreateDynamicFunction does, so its SyntaxError has the same phase.
    program: `
function strictParse() {
  return $262.evalScript("'use strict'; eval = 42; ");
}
assert.throws(SyntaxError, function () {
  var _13_0_14_fun = strictParse();
  _13_0_14_fun();
});
check(typeof globalThis.eval, "function");
assert.throws(SyntaxError, function () {
  $262.evalScript("var _13_0_13_fun = strictParse(); _13_0_13_fun();");
});
check(typeof _13_0_13_fun, "undefined");
check(typeof globalThis.eval, "function");
check(typeof acceptVarEval, "function");
check(typeof acceptVarArguments, "function");
var _13_0_4_17_fun = acceptEvalAssign;
check(typeof _13_0_4_17_fun, "function");
check(typeof globalThis.eval, "function");
`,
    mutations: [
      {
        from: `$262.evalScript("'use strict'; eval = 42; ")`,
        to: `$262.evalScript("eval = 42; ")`,
      },
      {
        from: "var _13_0_13_fun = strictParse(); _13_0_13_fun();",
        to: "var _13_0_13_fun = 1;",
      },
      {
        from: "var _13_0_4_17_fun = acceptEvalAssign;",
        to: "var _13_0_4_17_fun = acceptEvalAssign; acceptEvalAssign();",
      },
    ],
  },
];

function realmVariant(id: string, group: TraincGroup, program: string) {
  const realm = `r_${id}`;
  return [
    `const ${realm} = $262.createRealm();`,
    `${realm}.evalScript(${JSON.stringify(harness + traincCheck)});`,
    `${realm}.evalScript(${JSON.stringify(group.sloppy)});`,
    `${realm}.evalScript(${JSON.stringify(program)});`,
  ];
}

/** Original programs and mutation verdicts for each group and mode. */
export const traincFixtures: readonly Fixture[] = traincGroups.map((group) => {
  const lines: string[] = [];
  for (const mode of group.modes) {
    const prefix = mode === "strict" ? '"use strict";\n' : "";
    lines.push(...realmVariant(`${mode}_0`, group, prefix + group.program));
    for (const [index, mutation] of group.mutations.entries()) {
      const id = `${mode}_${index + 1}`;
      const [create, setup, sloppy, invoke] = realmVariant(
        id,
        group,
        prefix + group.program.replace(mutation.from, mutation.to),
      );
      lines.push(
        create!,
        setup!,
        sloppy!,
        `let rejected_${id} = false;`,
        "try {",
        invoke!,
        "} catch (error) {",
        `if (!(error instanceof r_${id}.global.Test262Error)) throw error;`,
        `rejected_${id} = true;`,
        "}",
        `if (!rejected_${id}) throw new Error("mutation survived");`,
      );
    }
  }
  lines.push(`console.log("${group.name} ok");`);
  return { name: group.name, source: lines.join("\n"), test262Host: true };
});

/** Type-confusion mutants have identical printed values to their oracles. */
export const traincValueOracleFixture: Fixture = {
  name: "trainc-value-oracle",
  test262Host: true,
  source:
    "$262.evalScript(" +
    JSON.stringify(
      harness +
        "\n" +
        traincCheck +
        `
function rejected(action) {
  var caught = false;
  try { action(); }
  catch (error) {
    if (!(error instanceof Test262Error)) throw error;
    caught = true;
  }
  if (!caught) throw new Error("type confusion survived");
}
check(42, 42);
check(undefined, undefined);
rejected(function () { check(42, "42"); });
rejected(function () { check("42", 42); });
rejected(function () { check(2, "2"); });
rejected(function () { check(undefined, "undefined"); });
rejected(function () { check(0, false); });
rejected(function () { check(false, "false"); });
rejected(function () { check("function", function () {}); });
rejected(function () {
  assert.throws(TypeError, function () { throw new RangeError("x"); });
});
rejected(function () {
  assert.throws(SyntaxError, function () { throw new TypeError("x"); });
});
rejected(function () { assert.throws(TypeError, function () {}); });
rejected(function () { assert.notSameValue("caller", "caller"); });
`,
    ) +
    ');\nconsole.log("trainc-value-oracle ok");',
};
