/** Fixed Scripts run unchanged in both native policies. */
export const hostScriptBindingFixtures: readonly {
  readonly name: string;
  readonly source: string;
  readonly expected: string;
  /** Qualified Deno vm result; its internal cause remains unverified. */
  readonly denoExpected?: string;
}[] = [
  {
    name: "persistent declarations and closures",
    source: `
let mainLexical = 3;
$262.evalScript('let x = mainLexical; const c = 7;' +
  'function read(){ return x; }');
$262.evalScript('x += 2; function other(){ return read(); }');
console.log(read(), other(), typeof x, 'x' in globalThis);
try { c = 0; } catch (error) { console.log(error instanceof TypeError); }
console.log(delete x, x, c);
const first = read;
$262.evalScript('function read(){ return 9; }');
console.log(first === read, first(), read());
`,
    expected: "5 5 number false\ntrue\nfalse 5 7\nfalse 5 9\n",
  },
  {
    name: "completion values and strictness",
    source: `
console.log($262.evalScript('1; var unused = 4; {}'));
console.log($262.evalScript('var onlyInitializer = 5;'));
console.log($262.evalScript('1; if(false) { 2; }'));
console.log($262.evalScript('for(var i=0;i<3;i++){ i; }'));
console.log($262.evalScript('switch(1){case 1: 7; break; default: 8;}'));
console.log($262.evalScript('try { 3; } finally { 8; }'));
console.log($262.evalScript('try { throw 1; } catch(e) { e + 4; }'));
console.log($262.evalScript(
  'outer: for(var j=0;j<2;j++){ j; continue outer; }'));
try { $262.evalScript('"use strict"; missingStrict = 1;'); }
catch (error) { console.log(error instanceof ReferenceError); }
`,
    expected: "1\nundefined\nundefined\n2\n7\n3\n5\n1\ntrue\n",
  },
  {
    name: "atomic instantiation and abrupt body",
    source: `
let occupied;
try { $262.evalScript('var untouched; let occupied;'); }
catch (error) { console.log(error instanceof SyntaxError); }
console.log('untouched' in globalThis);
const token = {};
globalThis.thrownToken = token;
try { $262.evalScript('let retained = 3; throw thrownToken;'); }
catch (error) { console.log(error === token); }
console.log(retained);
try { $262.evalScript('let invalid = ;'); }
catch (error) { console.log(error instanceof SyntaxError); }
console.log('invalid' in globalThis);
`,
    expected: "true\nfalse\ntrue\n3\ntrue\nfalse\n",
  },
  {
    name: "realm identity and restoration",
    source: `
const other = $262.createRealm();
other.evalScript('let x = 4; function read(){ return [x, Object]; }');
$262.evalScript('let x = 2; function read(){ return [x, Object]; }');
const foreignRead = other.global.read;
console.log(foreignRead()[0], foreignRead()[1] === other.global.Object);
console.log(read()[0], read()[1] === Object, typeof other.global.x);
const evaluate = other.evalScript;
console.log(evaluate('x;'), Object.getPrototypeOf(evaluate) ===
  other.global.Function.prototype);
try { evaluate('let broken = ;'); }
catch (error) { console.log(error instanceof other.global.SyntaxError); }
console.log(Object === $262.global.Object, $262.global === globalThis);
`,
    expected: "4 true\n2 true undefined\n4 true\ntrue\ntrue true\n",
  },
  {
    name: "host binding descriptors and first-argument print",
    source: `
const descriptor = Object.getOwnPropertyDescriptor(this, 'print');
console.log(print.name, print.length, descriptor.writable,
  descriptor.enumerable, descriptor.configurable);
print({ toString() { return 'printed'; } }, 'ignored');
console.log($262.evalScript.length, $262.evalScript.name);
try { new $262.evalScript('1'); }
catch (error) { console.log(error instanceof TypeError); }
try { $262.evalScript(1); }
catch (error) { console.log(error instanceof TypeError); }
`,
    expected: "print 1 true false true\nprinted\n1 evalScript\ntrue\ntrue\n",
  },
  {
    name: "with fallback and assignment reference timing",
    source: `
globalThis.target = 1;
with ({}) {
  target = $262.evalScript('let target = 7; 9;');
}
console.log(target, globalThis.target);
$262.evalScript('let lexical = 4;');
with ({}) { lexical += 2; }
console.log(lexical);
with ({ lexical: 20 }) { console.log(lexical); }
`,
    expected: "9 1\n6\n20\n",
  },
  {
    name: "global record lookup after configurable var shadowing",
    source: `
$262.evalScript('globalThis.alias = 1;');
$262.evalScript('var alias; function oldRead(){return alias;}');
try { $262.evalScript('let alias = 5;'); }
catch (error) { console.log('alias syntax', error.name); }
console.log(alias, oldRead(), globalThis.alias);
$262.evalScript('oldRead = function(){ return alias + 1; };');
console.log(oldRead());
`,
    expected: "5 5 1\n6\n",
    denoExpected: "alias syntax SyntaxError\n1 1 1\n2\n",
  },
  {
    name: "strict tail calls retain foreign Script lexicals",
    source: `
const other = $262.createRealm();
other.evalScript('"use strict"; let held = 4;' +
  'function tail(n, token) {' +
  'return n === 0 ? [held, Object, token] : tail(n - 1, token); }' +
  'function fail(n, token) {' +
  'if (n === 0) throw token; return fail(n - 1, token); }' +
  'function forward(n, token) {' +
  'return Reflect.apply(tail, undefined, [n, token]); }' +
  'function nested() { return $262.evalScript("held + 1;"); }' +
  'function say() { return print("tail host"); }');
$262.evalScript('"use strict"; let mainHeld = 3;' +
  'function mainTail(n) { return n === 0 ? mainHeld : mainTail(n - 1); }');
const token = {};
const detached = other.global.forward;
const result = detached(768, token);
console.log(result[0], result[1] === other.global.Object,
  result[2] === token, mainTail(768), other.global.nested());
const bound = other.global.tail.bind(undefined, 768, token);
const wrapped = new Proxy(bound, {});
const forwarded = Reflect.apply(wrapped, undefined, []);
console.log(forwarded[0], forwarded[1] === other.global.Object,
  forwarded[2] === token);
try { other.global.fail(768, token); }
catch (error) { console.log(error === token); }
console.log(other.global.say());
console.log(typeof held, Object === $262.global.Object);
`,
    expected:
      "4 true true 3 5\n4 true true\ntrue\ntail host\nundefined\n" +
      "undefined true\n",
  },
  // A later Script's lexical declaration over a configurable global
  // property captures every simple `var` loop-head write. Deno's vm keeps
  // the legacy var-name check that the generated model also qualifies, so
  // it rejects that declaration and its loops write the properties.
  {
    name: "var loop heads resolve later lexical declarations",
    source: `
globalThis.a = globalThis.b = globalThis.c = 0;
globalThis.d = globalThis.e = globalThis.f = 0;
$262.evalScript('var a, b, c, d, e, f; try { $262.evalScript(' +
  '"let a = 1, b = 1, c = 1; const d = 1, e = 1, f = 1;"); }' +
  ' catch (error) { console.log("shadow", error.constructor.name); }' +
  ' for (var a of [2]) {} for (var b in { 2: 0 }) {}' +
  ' for (var c = 2; false; ) {}' +
  ' try { for (var d of [2]) {} } catch (error) { console.log(error.name); }' +
  ' try { for (var e in { 2: 0 }) {} }' +
  ' catch (error) { console.log(error.name); }' +
  ' try { for (var f = 2; false; ) {} }' +
  ' catch (error) { console.log(error.name); }' +
  ' console.log(a, b, c, d, e, f, globalThis.a, globalThis.b, globalThis.c,' +
  ' globalThis.d, globalThis.e, globalThis.f);');
$262.evalScript('"use strict"; for (var s of [3]) {}' +
  ' for (var t = function () {}; false; ) {}' +
  ' console.log(s, globalThis.s, t.name, globalThis.t === t);');
`,
    expected:
      "TypeError\nTypeError\nTypeError\n2 2 2 1 1 1 0 0 0 0 0 0\n" +
      "3 3 t true\n",
    denoExpected: "shadow SyntaxError\n2 2 2 2 2 2 2 2 2 2 2 2\n3 3 t true\n",
  },
  {
    name: "for-initializer const aliases keep literal Scripts",
    source: `
for (const evaluate = $262.evalScript, again = evaluate; ; ) {
  console.log(evaluate('1;'), (() => again('2;'))());
  break;
}
$262.evalScript('for (const nested = $262.evalScript; ; ) {' +
  ' console.log(nested("3;")); break; }');
`,
    expected: "1 2\n3\n",
  },
  // The with-hit `for (var x in/of ...)` head is a known outside-scope
  // defect on both targets, owned by the separate remediation node
  // `with-var-loop-head-resolution`; this fixture does not cover it.
  {
    name: "with fallback writes reach declared global properties",
    source: `
var v = 1, w = 0, k, f, r, s, o = { hit: 0 };
function g() { return 'g'; }
with ({}) {
  [v] = [3];
  ({ a: w } = { a: 4 });
  for (k in { key: 1 }) {}
  for (f of [5]) {}
  [...r] = [6, 7];
  ({ ...s } = { t: 8 });
  [g = 9] = [];
}
console.log(v, w, k, f, r.length, s.t, g, globalThis.v, globalThis.k);
var hit = 'outer';
with (o) { [hit] = [10]; for (hit in { h: 1 }) {} }
console.log(o.hit, hit);
with ({}) {
  for ([v, k] of [[13, 'm']]) {} for ({ length: w } in { ab: 1 }) {}
}
console.log(v, k, w, $262.evalScript('v + k + w;'));
$262.evalScript('var later = 0; with ({}) { (function () {' +
  ' "use strict"; [later] = [11]; for (later of [12]) {} })(); }');
console.log(later, globalThis.later);
with ({}) { var dv = 1; for (var dk in { q: 1 }) {} var [dp] = [2]; }
console.log(dv, dk, dp, globalThis.dp);
var hv = 'g';
var held = { hv: 0 };
with (held) { var hv = 5; var { hp: hv } = { hp: 6 }; }
console.log(hv, held.hv);
`,
    expected:
      "3 4 key 5 2 8 9 3 key\nh outer\n13 m 2 13m2\n12 12\n1 q 2 2\ng 6\n",
  },
];

/**
 * One assignment-target form per Script that reaches an all-miss `with`
 * fallback for a declared global name. Each prints the name and the
 * global object's property, so a write that stopped at a hidden cell
 * instead of the property would print two different values.
 */
export const withFallbackWriteCases: readonly {
  readonly name: string;
  readonly source: string;
  readonly expected: string;
}[] = [
  ["simple", "var v = 1; with ({}) { v = 3; }", "3 3"],
  ["compound", "var v = 1; with ({}) { v += 2; }", "3 3"],
  ["logical", "var v = 0; with ({}) { v ||= 3; }", "3 3"],
  ["update", "var v = 2; with ({}) { v++; }", "3 3"],
  ["array", "var v = 1; with ({}) { [v] = [3]; }", "3 3"],
  ["array default", "var v = 1; with ({}) { [v = 3] = []; }", "3 3"],
  ["array rest", "var v; with ({}) { [, ...v] = [0, 3]; } v = v[0];", "3 3"],
  ["object shorthand", "var v = 1; with ({}) { ({ v } = { v: 3 }); }", "3 3"],
  ["object key", "var v = 1; with ({}) { ({ a: v } = { a: 3 }); }", "3 3"],
  [
    "object rest",
    "var v; with ({}) { ({ ...v } = { b: 3 }); } v = v.b;",
    "3 3",
  ],
  ["nested", "var v = 1; with ({}) { [{ a: [v] }] = [{ a: [3] }]; }", "3 3"],
  ["for-in head", "var v; with ({}) { for (v in { 3: 0 }) {} }", "3 3"],
  ["for-of head", "var v; with ({}) { for (v of [3]) {} }", "3 3"],
  ["for-of pattern", "var v; with ({}) { for ([v] of [[3]]) {} }", "3 3"],
  [
    "for-in pattern",
    "var v; with ({}) { for ({ length: v } in { abc: 0 }) {} }",
    "3 3",
  ],
  [
    "for-await head",
    "var v; with ({}) { (async function () {" +
      " for await (v of [3]) {} console.log(v, globalThis.v); })(); }",
    "undefined undefined\n3 3",
  ],
  ["var initializer", "with ({}) { var v = 3; }", "3 3"],
  ["var for-in head", "with ({}) { for (var v in { 3: 0 }) {} }", "3 3"],
  ["var pattern", "with ({}) { var [v] = [3]; }", "3 3"],
  ["function name", "function v() {} with ({}) { [v] = [3]; }", "3 3"],
  [
    "strict inner function",
    "var v; with ({}) { (function () { 'use strict'; [v] = [3]; })(); }",
    "3 3",
  ],
].map(([name, source, expected]) => ({
  name: name!,
  source: `${source} console.log(v, globalThis.v);`,
  expected: `${expected}\n`,
}));
