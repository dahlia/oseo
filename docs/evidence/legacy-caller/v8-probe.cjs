// Observes the legacy `caller` and `arguments` own properties of non-strict
// functions on V8. Run it with the pinned Node.js: `node v8-probe.cjs`.
// Every case runs as Script code through `vm`, so no CommonJS wrapper
// function sits below the top level. The output is the checked-in
// v8-probe.txt next to this file.
"use strict";

const vm = require("node:vm");

const scriptCases = String.raw`
var out = [];
function nm(v) {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "function") return v.name || "<anonymous>";
  return typeof v;
}
function attempt(fn) {
  try { return fn(); } catch (e) { return "throws " + e.constructor.name; }
}
function report(group, label, value) { out.push(group + "\t" + label + "\t" + value); }

// Own properties.
function plain() {}
report("own", "keys of a declaration", Reflect.ownKeys(plain).join(","));
report("own", "keys of an expression", Reflect.ownKeys(function () {}).join(","));
plain.extra = 1;
report("own", "keys after a new property", Reflect.ownKeys(plain).join(","));
report("own", "caller descriptor",
  JSON.stringify(Object.getOwnPropertyDescriptor(plain, "caller")));
report("own", "arguments descriptor",
  JSON.stringify(Object.getOwnPropertyDescriptor(plain, "arguments")));
var kinds = {
  "strict function": function () { "use strict"; },
  arrow: () => 0,
  method: { m() {} }.m,
  getter: Object.getOwnPropertyDescriptor({ get g() { return 0; } }, "g").get,
  generator: function* () {},
  "async function": async function () {},
  "async generator": async function* () {},
  class: class {},
  bound: plain.bind(null),
  "built-in": Array.prototype.map,
};
for (var kind in kinds) {
  report("own", "has own caller: " + kind, Object.hasOwn(kinds[kind], "caller"));
}
report("own", "delete caller", delete plain.caller);
report("own", "sloppy assignment", (plain.caller = 1, nm(plain.caller)));
report("own", "strict assignment",
  attempt(function () { "use strict"; plain.caller = 1; return "ok"; }));
report("own", "define the current value",
  attempt(function () { Object.defineProperty(plain, "caller", { value: null }); return "ok"; }));
report("own", "define another value",
  attempt(function () { Object.defineProperty(plain, "caller", { value: 1 }); return "ok"; }));
report("own", "frozen after freeze", Object.isFrozen(Object.freeze(function () {})));

// Who is reported.
function target() { return nm(target.caller); }
function viaG() { return target(); }
report("caller", "inactive", nm(target.caller));
report("caller", "sloppy function", viaG());
report("caller", "top-level Script", target());
report("caller", "strict function", (function s() { "use strict"; return target(); })());
report("caller", "sloppy arrow", (() => target())());
report("caller", "sloppy method", ({ m() { return target(); } }).m());
report("caller", "class method", (class { static s() { return target(); } }).s());
report("caller", "sloppy generator", (function* gen() { yield target(); })().next().value);
report("caller", "resumed generator",
  (function () { function* gen() { yield 0; yield target(); } var it = gen(); it.next(); return it.next().value; })());
var pending = [
  (async function af() { return target(); })().then(function (v) { report("caller", "async function before await", v); }),
  (async function af() { await 0; return target(); })().then(function (v) { report("caller", "async function after await", v); }),
  (async function* ag() { yield target(); })().next().then(function (r) { report("caller", "async generator", r.value); }),
  Promise.resolve().then(function job() { report("caller", "promise job", nm(job.caller)); }),
];
report("caller", "constructor call", (function g() { function K() { this.c = nm(K.caller); } return new K().c; })());
report("caller", "caller.caller",
  (function c0() { function c1() { return c2(); } function c2() { return nm(c2.caller.caller); } return c1(); })());

// Forwarding built-ins and exotic callables.
report("forward", "Function.prototype.call", (function g() { return target.call(null); })());
report("forward", "Function.prototype.apply", (function g() { return target.apply(null, []); })());
report("forward", "call.call", (function g() { return Function.prototype.call.call(target, null); })());
report("forward", "Reflect.apply", (function g() { return Reflect.apply(target, null, []); })());
report("forward", "Reflect.construct",
  (function g() { function K() { this.c = nm(K.caller); } return Reflect.construct(K, []).c; })());
report("forward", "bound function", (function g() { return target.bind(null)(); })());
report("forward", "Proxy without a trap", (function g() { return new Proxy(target, {})(); })());
report("forward", "Proxy apply trap",
  (function g() { var r; new Proxy(function () {}, { apply: function trap() { r = nm(trap.caller); } })(); return r; })());
report("forward", "map through Reflect.apply",
  (function g() { return Reflect.apply(Array.prototype.map, [0], [target])[0]; })());

// Calls that syntax makes without a built-in function.
var R;
function cb() { R = nm(cb.caller); return 1; }
function cbs() { R = nm(cbs.caller); return "a"; }
var implicit = {
  "valueOf from +": function g() { +{ valueOf: cb }; },
  "toString from a template": function g() { "" + ${"`"}${"${"}{ toString: cbs }}${"`"}; },
  "Symbol.toPrimitive from +": function g() { ({ [Symbol.toPrimitive]: cb }) + 1; },
  "valueOf from ==": function g() { ({ valueOf: cb }) == 1; },
  "toString from a computed key": function g() { ({})[{ toString: cbs }]; },
  "for-of next": function g() { for (var _ of { [Symbol.iterator]() { return this; }, next: function n() { R = nm(n.caller); return { done: true }; } }); },
  "Symbol.iterator from spread": function g() { [...{ [Symbol.iterator]: function i() { R = nm(i.caller); return [][Symbol.iterator](); } }]; },
  "Symbol.hasInstance": function g() { ({}) instanceof { [Symbol.hasInstance]: function h() { R = nm(h.caller); return true; } }; },
  "tagged template": function g() { (function t() { R = nm(t.caller); })${"`"}x${"`"}; },
  "Proxy get trap from a member read": function g() { new Proxy({}, { get: function trap() { R = nm(trap.caller); } }).x; },
  "accessor function from a member read": function g() { var o = {}; Object.defineProperty(o, "x", { get: cb }); o.x; },
};
for (var label in implicit) { R = "not called"; implicit[label](); report("implicit", label, R); }

// Callbacks that built-in functions make.
var builtins = {
  "Array.prototype.map": function g() { [0].map(cb); },
  "Array.prototype.forEach": function g() { [0].forEach(cb); },
  "Array.prototype.sort": function g() { [2, 1].sort(cb); },
  "Array.from": function g() { Array.from([0], cb); },
  "Array.prototype.join": function g() { [{ toString: cbs }].join(); },
  "Map.prototype.forEach": function g() { new Map([[0, 0]]).forEach(cb); },
  "String.prototype.replace": function g() { "a".replace("a", cbs); },
  "String()": function g() { String({ toString: cbs }); },
  "Number()": function g() { Number({ valueOf: cb }); },
  "Promise executor": function g() { new Promise(cb); },
  "Object.keys trap": function g() { Object.keys(new Proxy({}, { ownKeys: function k() { R = nm(k.caller); return []; } })); },
  "Reflect.get accessor": function g() { var o = {}; Object.defineProperty(o, "x", { get: cb }); Reflect.get(o, "x"); },
  "JSON.parse reviver": function g() { JSON.parse("1", cb); },
  "JSON.stringify replacer": function g() { JSON.stringify(1, cb); },
  "Reflect.set accessor": function g() { var o = {}; Object.defineProperty(o, "x", { set: cb }); Reflect.set(o, "x", 1); },
  "Object.defineProperty key": function g() { Object.defineProperty({}, { toString: cbs }, { value: 1 }); },
  "Error message": function g() { new Error({ toString: cbs }); },
  "new Date": function g() { new Date({ valueOf: cb }); },
  "BigInt()": function g() { BigInt({ valueOf: cb }); },
  "DisposableStack.prototype.dispose": function g() { var s = new DisposableStack(); s.defer(cb); s.dispose(); },
};
for (var label in builtins) { R = "not called"; attempt(builtins[label]); report("built-in", label, R); }

// Recursion, unwinding, and tail calls.
function rec(n) { return n === 0 ? nm(rec.caller) : rec(n - 1); }
report("stack", "recursion", (function outer() { return rec(2); })());
function rec2(n) { if (n > 0) rec2(n - 1); return nm(rec2.caller); }
report("stack", "after a nested activation returns", (function outer() { return rec2(2); })());
function unwind(n) { if (n === 1) { try { unwind(0); } catch (e) {} return nm(unwind.caller); } throw 0; }
report("stack", "after a nested activation throws", (function outer() { return unwind(1); })());
function tailTarget() { return nm(tailTarget.caller); }
report("stack", "strict tail call",
  (function outer() { return (function s() { "use strict"; return tailTarget(); })(); })());

// The arguments property.
function A(v) { return v === null ? "null" : JSON.stringify(Array.from(v)); }
function a1(a, b) { return A(a1.arguments); }
report("arguments", "inactive", A(a1.arguments));
report("arguments", "values", a1(1, 2));
report("arguments", "fewer than the parameters", a1(1));
report("arguments", "more than the parameters", a1(1, 2, 3));
function a2(a, b) { a = 9; return A(a2.arguments); }
report("arguments", "after assigning an uncaptured parameter", a2(1, 2));
function a3(a, b) { a = 9; var k = function () { return a; }; return A(a3.arguments); }
report("arguments", "after assigning a captured parameter", a3(1, 2));
function a4(a, b) { a = 9; arguments; return A(a4.arguments); }
report("arguments", "after assigning with arguments in the body", a4(1, 2));
function a5(a = 0, b) { a = 9; return A(a5.arguments); }
report("arguments", "after assigning with a non-simple list", a5(1, 2));
function a6() { return a6.arguments === a6.arguments; }
report("arguments", "same object on two reads", a6());
function a7() { return a7.arguments === arguments; }
report("arguments", "same object as the local arguments", a7());
function a8(a) { a8.arguments[0] = 5; return a; }
report("arguments", "writing an element changes the parameter", a8(1) !== 1);
function a9(a) {
  var v = a9.arguments;
  return [
    Object.prototype.toString.call(v),
    Reflect.ownKeys(v).map(String).join(","),
    v.callee === a9,
    JSON.stringify(Object.getOwnPropertyDescriptor(v, "callee")),
    JSON.stringify(Object.getOwnPropertyDescriptor(v, "length")),
    JSON.stringify(Object.getOwnPropertyDescriptor(v, "0")),
    v[Symbol.iterator] === Array.prototype.values,
    Object.getPrototypeOf(v) === Object.prototype,
    Object.isExtensible(v),
  ].join(" | ");
}
report("arguments", "shape", a9(1));
function a10(n) { if (n) return a10(0); return A(a10.arguments); }
report("arguments", "recursion", a10(1));
function a11(a, b) { return A(a11.arguments); }
report("arguments", "bound with a leading argument", a11.bind(null, 7)(8));
report("arguments", "through Function.prototype.call", (function g() { return a11.call(null, 3, 4); })());
Promise.all(pending).then(function () { return out.join("\n"); });
`;

// Every value the realm cases print is null or a named function.
function nameOf(value) {
  return value === null ? "null" : value.name;
}

async function main() {
  const lines = (
    await vm.runInThisContext(scriptCases, { filename: "cases.js" })
  ).split("\n");

  // Realms. A second context is a second realm; `vm` gives it the same
  // security token, as the test262 host for Node.js does.
  const other = vm.createContext({});
  const define = `
function nm(v) { return v === null ? "null" : typeof v === "function" ? v.name || "<anonymous>" : typeof v; }
function callsIt(fn) { return fn(); }
function readsCaller(fn) { return nm(fn.caller); }
function readsArgumentsPrototype(fn, proto) {
  var v = fn.arguments;
  return Object.getPrototypeOf(v) === Object.prototype ? "reader's realm"
    : Object.getPrototypeOf(v) === proto ? "function's realm" : "other";
}
function selfCaller() { return selfCaller.caller; }
`;
  vm.runInContext(define, other);
  vm.runInThisContext(define);
  const local = vm.runInThisContext(
    "({ callsIt, readsCaller, readsArgumentsPrototype, selfCaller })",
  );
  const foreign = vm.runInContext(
    "({ callsIt, readsCaller, readsArgumentsPrototype, selfCaller })",
    other,
  );
  lines.push(
    "realm\tcaller in another realm\t" +
      nameOf(foreign.callsIt(local.selfCaller)),
  );
  lines.push(
    "realm\tcallee in another realm\t" +
      nameOf(local.callsIt(foreign.selfCaller)),
  );
  vm.runInThisContext(
    "function readFrom(reader) { function inner() { return reader(inner); } return inner(); }",
  );
  const readFrom = vm.runInThisContext("readFrom");
  lines.push(
    "realm\tcaller read from another realm\t" + readFrom(foreign.readsCaller),
  );
  vm.runInThisContext(
    "function argsFrom(reader) { function inner(x) { return reader(inner, Object.prototype); } return inner(1); }",
  );
  const argsFrom = vm.runInThisContext("argsFrom");
  lines.push(
    "realm\targuments object read from another realm\t" +
      argsFrom(foreign.readsArgumentsPrototype),
  );
  lines.push(
    "realm\town keys in another realm\t" +
      vm.runInContext("Reflect.ownKeys(function () {}).join(',')", other),
  );

  process.stdout.write(`Node.js ${process.version}\n${lines.join("\n")}\n`);
}

main();
