/*
 * Fixed native fixtures of the Annex B function declaration and statement
 * forms. Every source is non-strict Script code. A `hosts` fixture must
 * match Node.js and Deno, which run it as a Script through the host
 * script reference. A `model` fixture covers a rule where V8 departs from
 * the edition, so its expected output is written from ECMA-262 instead.
 *
 * Every source ends with the same guard-miss probe: one property read sees
 * two object shapes, so the specialized build takes a guard miss into the
 * generic path.
 */

export interface AnnexBFunctionFixture {
  /** Expected output written from the edition, for a `model` fixture. */
  readonly expected?: string;
  readonly name: string;
  readonly reference: "hosts" | "model";
  readonly source: string;
  /** Compile with the test262 host for `$262.evalScript`. */
  readonly test262Host?: true;
}

const guardMissProbe = `
(function () {
  var shapes = [{ k: 1 }, { k: 2 }, { j: 0, k: 3 }];
  var shapeTotal = 0;
  for (var shapeIndex = 0; shapeIndex < shapes.length; shapeIndex++) {
    shapeTotal += shapes[shapeIndex].k;
  }
  console.log("shape", shapeTotal);
})();
`;

function fixture(
  name: string,
  source: string,
  options: Partial<AnnexBFunctionFixture> = {},
): AnnexBFunctionFixture {
  const result: AnnexBFunctionFixture = {
    name,
    reference: "hosts",
    source: source + guardMissProbe,
    ...options,
  };
  if (options.expected == null) return result;
  return { ...result, expected: `${options.expected}shape 6\n` };
}

export const annexBFunctionFixtures: readonly AnnexBFunctionFixture[] = [
  fixture(
    "annexb-block-function-code",
    `
(function () {
  console.log("before", typeof f, f === undefined);
  {
    console.log("inside", f());
    function f() { return "block"; }
  }
  console.log("after", f());
})();
(function () {
  var initial, current, outer;
  {
    function g() { initial = g; g = 123; current = g; return "g"; }
  }
  outer = g;
  g();
  console.log("scoping", initial(), current, outer());
})();
(function () {
  var seen = [];
  for (var i = 0; i < 3; i++) {
    function h() { return i; }
    seen.push(h());
  }
  console.log("loop", seen.join(","), h());
})();
(function () {
  { function a() { return 1; } }
  { function a() { return 2; } }
  console.log("sequential", a());
})();
(function () {
  function e() { return "top"; }
  console.log("existing", e());
  { function e() { return "inner"; } }
  console.log("updated", e());
})();
(function () {
  var v = "var";
  console.log("existing var", v);
  { function v() { return "fn"; } }
  console.log("var updated", v());
})();
`,
  ),
  fixture(
    "annexb-if-and-switch-functions",
    `
(function (flag) {
  console.log("pre", typeof a, typeof b, typeof c, typeof d);
  if (flag) function a() { return "a"; } else function b() { return "b"; }
  if (!flag) ; else function c() { return "c"; }
  if (flag) function d() { return "d"; }
  console.log("post", a(), typeof b, c(), d());
})(true);
(function (n) {
  console.log("pre", typeof s1, typeof s2, typeof s3);
  switch (n) {
    case 1: function s1() { return 1; }
    case 2: function s2() { return 2; } break;
    default: function s3() { return 3; }
  }
  console.log("post", typeof s1, s2(), typeof s3);
})(2);
`,
  ),
  fixture(
    "annexb-function-skip-rules",
    `
(function (p) {
  { function p() {} }
  console.log("param", p);
})(1);
(function (q = 2) {
  { function q() {} }
  console.log("default param", q);
})();
(function () {
  let z = 3;
  { function z() {} }
  console.log("let", z);
})();
(function () {
  {
    function n() { return "outer"; }
    { function n2() { return "inner"; } }
  }
  console.log("nested", n(), n2());
})();
(function () {
  for (let w = 0; w < 1; w++) { function w() {} }
  console.log("for let", typeof w);
})();
(function () {
  try { throw { t: 1 }; } catch ({ t }) { { function t() {} } }
  console.log("catch pattern", typeof t);
})();
(function () {
  try { throw 1; } catch (u) { { function u() { return "u"; } } }
  console.log("catch simple", u());
})();
(function () {
  var o = { m: "object" };
  with (o) { { function m() { return "m"; } } }
  console.log("with", o.m, m());
})();
(function (x = 1) {
  { function k() { return "k"; } }
  var j;
  console.log("parameter body", k(), j);
})();
(function () {
  { function* gen() {} async function asy() {} }
  console.log("kinds", typeof gen, typeof asy);
})();
(function () {
  "use strict";
  { function strictBlock() {} }
  console.log("strict", typeof strictBlock);
})();
`,
  ),
  fixture(
    "annexb-labelled-function",
    `
console.log("top", typeof lt, lt());
lt: function lt() { return "lt"; }
(function () {
  console.log("body", inner());
  a: b: function inner() { return "inner"; }
})();
`,
  ),
  fixture(
    "annexb-global-block-functions",
    `
var out = [];
var gbDescriptor = Object.getOwnPropertyDescriptor(globalThis, "gb");
out.push(typeof gb, JSON.stringify(gbDescriptor));
{ function gb() { return "gb"; } }
out.push(gb(), Object.getOwnPropertyDescriptor(globalThis, "gb").value === gb);
if (true) function gi() { return "gi"; } else function gj() {}
out.push(gi(), typeof gj, "gj" in globalThis);
switch (0) { default: function gs() { return "gs"; } }
out.push(gs());
{ function parseInt() { return "replaced"; } }
out.push(parseInt(), globalThis.parseInt === parseInt);
let lexicalName = "lexical";
{ function lexicalName() {} }
out.push(lexicalName, "lexicalName" in globalThis);
console.log(out.join(" | "));
`,
  ),
  fixture(
    "annexb-global-host-scripts",
    `
var out = [];
Object.defineProperty(globalThis, "existing", {
  configurable: true,
  enumerable: false,
  value: "x",
  writable: true,
});
$262.evalScript("{ function existing() { return 'fn'; } }");
var existingDescriptor =
  Object.getOwnPropertyDescriptor(globalThis, "existing");
out.push(
  existing(),
  existingDescriptor.enumerable,
  existingDescriptor.configurable,
);
if (true) { function collide() {} }
try {
  $262.evalScript("var unbound; let collide;");
} catch (error) {
  out.push(error.constructor === SyntaxError, typeof unbound);
}
console.log(out.join(" | "));
`,
    { test262Host: true },
  ),
  fixture(
    "annexb-for-in-initializer",
    `
var effects = [];
(function () {
  for (var a = (effects.push("init"), "start") in
    (effects.push("subject"), {})) ;
  console.log("empty", a, effects.join(","));
})();
(function () {
  var keys = [];
  outer: for (var key = "seed" in { p: 1, q: 2 }) {
    keys.push(key);
    continue outer;
  }
  console.log("keys", keys.join(","), key);
})();
(function () {
  for (var named = function () {} in {}) ;
  for (var arrow = () => 1 in {}) ;
  console.log("names", named.name, arrow.name);
})();
(function () {
  var captured;
  for (var c = (captured = function () { return c; }, 5) in { x: 1 }) ;
  console.log("closure", captured());
})();
`,
  ),
  fixture(
    "annexb-call-assignment-targets",
    `
var log = [];
function target() {
  log.push("call");
  return { valueOf() { log.push("valueOf"); return 1; } };
}
function value() { log.push("value"); return 1; }
function check(name, run) {
  log = [];
  try {
    run();
    console.log(name, "no error");
  } catch (error) {
    console.log(name, error.constructor === ReferenceError, log.join(","));
  }
}
check("assign", function () { target() = value(); });
check("compound", function () { target() += value(); });
check("postfix", function () { target()++; });
check("prefix", function () { --target(); });
check("parenthesized", function () { (target()) = value(); });
check("for-in", function () {
  for (target() in { a: 1, b: 2 }) log.push("body");
});
check("for-in empty", function () { for (target() in {}) log.push("body"); });
check("for-of", function () { for (target() of [1, 2]) log.push("body"); });
var closed = false;
var iterable = {};
iterable[Symbol.iterator] = function () {
  return {
    next: function () { return { done: false, value: 1 }; },
    return: function () { closed = true; return {}; },
  };
};
check("for-of close", function () { for (target() of iterable) ; });
console.log("closed", closed);
function async() { log.push("async"); }
check("async call", function () { async() = 1; });
`,
  ),
  fixture(
    "annexb-duplicate-block-functions-model",
    `
(function () {
  {
    function d() { return 1; }
    function d() { return 2; }
    console.log("block", d());
  }
  console.log("block var", typeof d);
})();
(function (n) {
  switch (n) {
    case 1: function s() { return 1; }
    default: function s() { return 2; }
  }
  console.log("switch", typeof s);
})(1);
(function () {
  { l: function labelled() { return "l"; } console.log("label", labelled()); }
  console.log("label var", typeof labelled);
})();
(function () {
  { function arguments() {} }
  console.log("arguments", Object.prototype.toString.call(arguments));
})();
(function () {
  {
    function n() { return "outer"; }
    { function n() { return "inner"; } }
  }
  console.log("nested", n());
})();
{ function created() {} }
var createdDescriptor = Object.getOwnPropertyDescriptor(globalThis, "created");
console.log(
  "created",
  createdDescriptor.enumerable,
  createdDescriptor.configurable,
);
{ function isNaN() {} }
var isNaNDescriptor = Object.getOwnPropertyDescriptor(globalThis, "isNaN");
console.log(
  "intrinsic",
  isNaNDescriptor.enumerable,
  isNaNDescriptor.configurable,
);
$262.evalScript("let shadow = 'lexical';");
$262.evalScript("{ function shadow() {} } console.log('shadow', shadow);");
console.log("shadow global", "shadow" in globalThis);
`,
    {
      expected:
        "block 2\nblock var undefined\nswitch undefined\n" +
        "label l\nlabel var undefined\narguments [object Arguments]\n" +
        "nested outer\ncreated true false\nintrinsic false true\n" +
        "shadow lexical\nshadow global false\n",
      reference: "model",
      test262Host: true,
    },
  ),
];
