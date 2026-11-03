import type { Fixture } from "../fixture.ts";

/*
 * The own `caller` and `arguments` properties of non-strict functions
 * (ADR 0034), one fixture per group of contract bullets. Each source is a
 * non-strict Script. The references run it inside `new Function`, so no
 * case reads an answer that top-level code would give; tests/legacy-caller
 * .test.ts pins those, the configurable descriptors, and the two other
 * cases where Oseo departs from V8, with fixed expectations. Every case
 * prints a name or a comparison rather than a function, because the hosts
 * print functions differently.
 */
const prelude = `
function nm(v) {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "function") return v.name || "<anonymous>";
  return typeof v;
}
function attempt(fn) {
  try { return fn(); } catch (e) { return "throws " + e.constructor.name; }
}
`;

export const legacyCallerFixtures: readonly Fixture[] = [
  {
    name: "legacy-caller-properties",
    nonStrictScript: true,
    source: `${prelude}
function plain() {}
console.log("keys", Reflect.ownKeys(plain).join());
console.log("expression keys", Reflect.ownKeys(function () {}).join());
console.log("names", Object.getOwnPropertyNames(plain).join());
plain.extra = 1;
plain[Symbol.iterator] = 2;
plain[0] = 3;
console.log("keys with additions", Reflect.ownKeys(plain).map(String).join());
delete plain.name;
console.log("keys without name", Reflect.ownKeys(plain).map(String).join());
for (var key of ["caller", "arguments"]) {
  var found = Object.getOwnPropertyDescriptor(plain, key);
  console.log(key, nm(found.value), found.writable, found.enumerable);
  console.log(key, "own", Object.hasOwn(plain, key), key in plain,
    plain.hasOwnProperty(key), plain.propertyIsEnumerable(key));
  plain[key] = 1;
  console.log(key, "assigned", nm(plain[key]));
  console.log(key, "strict assignment",
    attempt(function () { "use strict"; plain[key] = 1; return "ok"; }));
  console.log(key, "define current",
    attempt(function () {
      Object.defineProperty(plain, key, { value: null });
      return "ok";
    }));
  console.log(key, "define empty",
    attempt(function () {
      Object.defineProperty(plain, key, {});
      return "ok";
    }));
  console.log(key, "reflect define current",
    Reflect.defineProperty(plain, key, { value: null }));
}
var enumerated = [];
for (var name in plain) enumerated.push(name);
console.log("for-in", enumerated.join());
console.log("Object.keys", Object.keys(plain).join());
console.log("JSON", JSON.stringify(Object.assign({}, plain)));
var frozen = Object.freeze(function () {});
console.log("frozen", Object.isFrozen(frozen), Object.isSealed(function () {}));
var kinds = {
  "strict function": function () { "use strict"; },
  arrow: () => 0,
  method: { m() {} }.m,
  getter: Object.getOwnPropertyDescriptor({ get g() { return 0; } }, "g").get,
  setter: Object.getOwnPropertyDescriptor({ set s(v) {} }, "s").set,
  generator: function* () {},
  "async function": async function () {},
  "async arrow": async () => 0,
  "async generator": async function* () {},
  class: class {},
  bound: plain.bind(null),
  "built-in": Array.prototype.map,
  "Function.prototype": Function.prototype,
};
for (var kind in kinds) {
  var value = kinds[kind];
  console.log(kind, Object.hasOwn(value, "caller"),
    Object.hasOwn(value, "arguments"),
    attempt(function () { return nm(value.caller); }),
    attempt(function () { return nm(value.arguments); }));
}
function withArguments() { return Object.hasOwn(arguments, "caller"); }
console.log("arguments object own caller", withArguments());
var accessor = Object.getOwnPropertyDescriptor(Function.prototype, "caller");
console.log("prototype accessor", typeof accessor.get,
  accessor.get === accessor.set,
  accessor.configurable, accessor.enumerable);
`,
  },
  {
    name: "legacy-caller-identity",
    nonStrictScript: true,
    source: `${prelude}
function target() { return nm(target.caller); }
console.log("inactive", nm(target.caller));
console.log("sloppy function", (function viaG() { return target(); })());
console.log("strict function", (function s() {
  "use strict"; return target();
})());
console.log("sloppy arrow", (function () {
  var arrow = () => target(); return arrow();
})());
console.log("sloppy method", ({ m() { return target(); } }).m());
console.log("getter", ({ get x() { return target(); } }).x);
console.log("setter", (function () {
  var r;
  ({ set x(v) { r = target(); } }).x = 1;
  return r;
})());
console.log("class method", (class { static s() { return target(); } }).s());
console.log("class constructor", (function () {
  var r;
  new (class { constructor() { r = target(); } })();
  return r;
})());
console.log("generator", (function* gen() { yield target(); })().next().value);
console.log("resumed generator", (function () {
  function* gen() { yield 0; yield target(); }
  var it = gen(); it.next(); return it.next().value;
})());
console.log("generator parameter default", (function () {
  function* gen(a = target()) { yield a; }
  return gen().next().value;
})());
console.log("constructor call", (function g() {
  function K() { this.c = nm(K.caller); }
  return new K().c;
})());
console.log("super call", (function g() {
  var r; function B() { r = nm(B.caller); }
  class D extends B { constructor() { super(); } }
  new D(); return r;
})());
console.log("caller.caller", (function c0() {
  function c1() { return c2(); }
  function c2() { return nm(c2.caller.caller); }
  return c1();
})());
console.log("identity", (function g() {
  function f() { return f.caller === g; }
  return f();
})());

console.log("call", (function g() { return target.call(null); })());
console.log("apply", (function g() { return target.apply(null, [1]); })());
console.log("call.call", (function g() {
  return Function.prototype.call.call(target, null);
})());
console.log("apply.call", (function g() {
  return Function.prototype.apply.call(target, null, []);
})());
console.log("Reflect.apply", (function g() {
  return Reflect.apply(target, null, []);
})());
console.log("Reflect.construct", (function g() {
  function K() { this.c = nm(K.caller); } return Reflect.construct(K, []).c;
})());
console.log("bound", (function g() { return target.bind(null)(); })());
console.log("bound twice", (function g() {
  return target.bind(null).bind(null)();
})());
console.log("bound construct", (function g() {
  function K() { this.c = nm(K.caller); } return new (K.bind(null))().c;
})());
console.log("call of bound", (function g() {
  return target.bind(null).call(null);
})());
console.log("bound call", (function g() {
  return Function.prototype.call.bind(target)(null);
})());
console.log("Proxy", (function g() { return new Proxy(target, {})(); })());
console.log("Proxy construct", (function g() {
  function K() { this.c = nm(K.caller); } return new (new Proxy(K, {}))().c;
})());
console.log("Proxy apply trap", (function g() {
  var r;
  new Proxy(function () {}, {
    apply: function trap() { r = nm(trap.caller); },
  })();
  return r;
})());
console.log("Proxy trap forwards", (function g() {
  return new Proxy(target, {
    apply: function trap(t, self, args) { return t(); },
  })();
})());
console.log("map through Reflect.apply", (function g() {
  return Reflect.apply(Array.prototype.map, [0], [target])[0];
})());
console.log("map through call", (function g() {
  return Array.prototype.map.call([0], target)[0];
})());

var R;
function cb() { R = nm(cb.caller); return 1; }
function cbs() { R = nm(cbs.caller); return "a"; }
var implicit = {
  "valueOf from +": function g() { +{ valueOf: cb }; },
  "toString from a template": function g() { "" + \`\${{ toString: cbs }}\`; },
  "Symbol.toPrimitive": function g() { ({ [Symbol.toPrimitive]: cb }) + 1; },
  "valueOf from ==": function g() { ({ valueOf: cb }) == 1; },
  "toString from a computed key": function g() { ({})[{ toString: cbs }]; },
  "for-of next": function g() {
    for (var _ of {
      [Symbol.iterator]() { return this; },
      next: function n() { R = nm(n.caller); return { done: true }; },
    });
  },
  "spread iterator": function g() {
    [...{ [Symbol.iterator]: function i() {
      R = nm(i.caller); return [][Symbol.iterator]();
    } }];
  },
  "destructuring iterator": function g() {
    var [a] = { [Symbol.iterator]: function i() {
      R = nm(i.caller); return [][Symbol.iterator]();
    } };
  },
  "Symbol.hasInstance": function g() {
    ({}) instanceof {
      [Symbol.hasInstance]: function h() {
        R = nm(h.caller); return true;
      },
    };
  },
  "tagged template": function g() {
    (function t() { R = nm(t.caller); })\`x\`;
  },
  "Proxy get trap": function g() {
    new Proxy({}, {
      get: function trap() { R = nm(trap.caller); },
    }).x;
  },
  "Proxy has trap": function g() {
    "x" in new Proxy({}, {
      has: function trap() { R = nm(trap.caller); return true; },
    });
  },
  "accessor function": function g() {
    var o = {};
    Object.defineProperty(o, "x", { get: cb });
    o.x;
  },
  "setter function": function g() {
    var o = {};
    Object.defineProperty(o, "x", { set: cb });
    o.x = 1;
  },
};
for (var label in implicit) {
  R = "not called"; implicit[label]();
  console.log(label, R);
}

var builtins = {
  "Array.prototype.map": function g() { [0].map(cb); },
  "Array.prototype.forEach": function g() { [0].forEach(cb); },
  "Array.prototype.sort": function g() { [2, 1].sort(cb); },
  "Array.prototype.reduce": function g() { [1, 2].reduce(cb); },
  "Array.from": function g() { Array.from([0], cb); },
  "Array.prototype.join": function g() { [{ toString: cbs }].join(); },
  "Map.prototype.forEach": function g() { new Map([[0, 0]]).forEach(cb); },
  "Set.prototype.forEach": function g() { new Set([0]).forEach(cb); },
  "String.prototype.replace": function g() { "a".replace("a", cbs); },
  "String()": function g() { String({ toString: cbs }); },
  "Number()": function g() { Number({ valueOf: cb }); },
  "Promise executor": function g() { new Promise(cb); },
  "Object.keys trap": function g() {
    Object.keys(new Proxy({}, {
      ownKeys: function k() {
        R = nm(k.caller); return [];
      },
    }));
  },
  "Reflect.get accessor": function g() {
    var o = {};
    Object.defineProperty(o, "x", { get: cb });
    Reflect.get(o, "x");
  },
};
for (var label in builtins) {
  R = "not called"; attempt(builtins[label]);
  console.log(label, R);
}

var pending = [
  (async function af() { return target(); })().then(function (v) {
    return "async before await " + v;
  }),
  (async function af() { await 0; return target(); })().then(function (v) {
    return "async after await " + v;
  }),
  (async function af() {
    await null; await 0; return target();
  })().then(function (v) {
    return "async after two awaits " + v;
  }),
  (async () => { await 0; return target(); })().then(function (v) {
    return "async arrow after await " + v;
  }),
  (async function* ag() { yield target(); })().next().then(function (r) {
    return "async generator " + r.value;
  }),
  (async function* ag() {
    await 0; yield target();
  })().next().then(function (r) {
    return "async generator after await " + r.value;
  }),
  Promise.resolve().then(function job() {
    return "promise job " + nm(job.caller);
  }),
];
Promise.all(pending).then(function (lines) {
  for (var line of lines) console.log(line);
});
`,
  },
  {
    name: "legacy-caller-stack",
    nonStrictScript: true,
    source: `${prelude}
function rec(n) { return n === 0 ? nm(rec.caller) : rec(n - 1); }
console.log("recursion", (function outer() { return rec(3); })());
function rec2(n) { if (n > 0) rec2(n - 1); return nm(rec2.caller); }
console.log("after a nested activation returns", (function outer() {
  return rec2(3);
})());
function unwind(n) {
  if (n === 1) { try { unwind(0); } catch (e) {} return nm(unwind.caller); }
  throw 0;
}
console.log("after a nested activation throws", (function outer() {
  return unwind(1);
})());
function inner() { throw new Error("x"); }
function thrower() { inner(); }
function afterThrow() {
  try { thrower(); } catch (e) {}
  return nm(thrower.caller) + " " + nm(afterThrow.caller);
}
console.log("after unwinding", (function outer() { return afterThrow(); })());
function viaFinally() {
  try {
    return nm(viaFinally.caller);
  } finally {
    viaFinally.seen = nm(viaFinally.caller);
  }
}
console.log("finally", (function outer() {
  return viaFinally();
})(), viaFinally.seen);
function mutual(n) {
  return n === 0
    ? nm(mutual.caller) + " " + nm(other.caller)
    : other(n - 1);
}
function other(n) { return mutual(n); }
console.log("mutual recursion", (function outer() { return mutual(2); })());
function tailTarget() { return nm(tailTarget.caller); }
console.log("strict tail call", (function outer() {
  return (function s() { "use strict"; return tailTarget(); })();
})());
console.log("strict tail call through call", (function outer() {
  return (function s() { "use strict"; return tailTarget.call(null); })();
})());
console.log("strict tail call through apply", (function outer() {
  return (function s() { "use strict"; return tailTarget.apply(null, []); })();
})());
console.log("strict tail call through Reflect.apply", (function outer() {
  return (function s() {
    "use strict"; return Reflect.apply(tailTarget, null, []);
  })();
})());
console.log("strict tail call through bound", (function outer() {
  var bound = tailTarget.bind(null);
  return (function s() { "use strict"; return bound(); })();
})());
console.log("strict tail call through Proxy", (function outer() {
  var proxy = new Proxy(tailTarget, {});
  return (function s() { "use strict"; return proxy(); })();
})());
console.log("strict tail call of a forwarding sloppy function",
  (function outer() {
    function forward() { return tailTarget(); }
    return (function s() { "use strict"; return forward(); })();
  })());
console.log("strict tail call chain", (function outer() {
  function step(n) {
    "use strict"; return n === 0 ? tailTarget() : step(n - 1);
  }
  return step(1500);
})());
console.log("sloppy return call", (function outer() {
  return tailTarget();
})());
console.log("forwarding inside a strict non-tail call", (function outer() {
  return (function s() {
    "use strict"; var r = tailTarget.call(null); return r;
  })();
})());
console.log("inactive after return", nm(rec.caller), nm(tailTarget.caller));
console.log("callback reads its caller later", (function outer() {
  function late() { return late.caller; }
  var seen = late();
  return nm(seen) + " " + nm(late.caller);
})());
`,
  },
  {
    name: "legacy-caller-arguments",
    nonStrictScript: true,
    source: `${prelude}
function A(v) { return v === null ? "null" : JSON.stringify(Array.from(v)); }
function a1(a, b) { return A(a1.arguments); }
console.log("inactive", A(a1.arguments));
console.log("values", a1(1, 2));
console.log("none", a1());
console.log("fewer", a1(1));
console.log("more", a1(1, 2, 3));
console.log("objects", (function () {
  var o = {};
  function f(x) { return f.arguments[0] === o; }
  return f(o);
})());
function a3(a, b) {
  a = 9; var k = function () { return a; };
  return A(a3.arguments);
}
console.log("captured parameter reassigned", a3(1, 2));
function a4(a, b) { a = 9; arguments; return A(a4.arguments); }
console.log("body uses arguments", a4(1, 2));
function a5(a = 0, b) { a = 9; return A(a5.arguments); }
console.log("non-simple parameters", a5(1, 2));
function a6() { return a6.arguments === a6.arguments; }
console.log("same object on two reads", a6());
function a7() { return a7.arguments === arguments; }
console.log("same as local arguments", a7());
function a8(a) { var v = a8.arguments; v[0] = 5; return a + " " + v[0]; }
console.log("element write", a8(1));
function a9(a) {
  var v = a9.arguments;
  return [
    Object.prototype.toString.call(v),
    Reflect.ownKeys(v).map(String).join(","),
    v.callee === a9,
    JSON.stringify(Object.getOwnPropertyDescriptor(v, "length")),
    JSON.stringify(Object.getOwnPropertyDescriptor(v, "0")),
    (function () {
      var d = Object.getOwnPropertyDescriptor(v, "callee");
      return [d.writable, d.enumerable, d.configurable].join();
    })(),
    v[Symbol.iterator] === Array.prototype.values,
    Object.getPrototypeOf(v) === Object.prototype,
    Object.isExtensible(v),
    Array.isArray(v),
    [...v].join(),
  ].join(" | ");
}
console.log("shape", a9(1));
function a10(n) {
  if (n) return a10(0) + " " + A(a10.arguments);
  return A(a10.arguments);
}
console.log("recursion", a10(1));
function a11(a, b) { return A(a11.arguments); }
console.log("bound", a11.bind(null, 7)(8));
console.log("call", (function g() { return a11.call(null, 3, 4); })());
console.log("apply", (function g() { return a11.apply(null, [5, 6]); })());
console.log("Reflect.apply", Reflect.apply(a11, null, [1]));
console.log("callback", [10].map(a11)[0]);
function a12(a) {
  function inner() { return A(a12.arguments); }
  return inner();
}
console.log("read from an inner function", a12(4));
function a13(a) {
  return Reflect.get(a13, "arguments")[0] + " " +
    Object.getOwnPropertyDescriptor(a13, "arguments").value[0];
}
console.log("reflective reads", a13(7));
function a14() {
  return Object.getOwnPropertyDescriptors(a14).arguments.value.length;
}
console.log("descriptors", a14(1, 2));
function a15() {
  "use strict"; return attempt(function () {
    return a15.arguments;
  });
}
console.log("strict function", a15());
function a20(a) {
  return A(Object.getOwnPropertyDescriptor(a20, "arguments").value);
}
console.log("descriptor value", a20(3));
`,
  },
  {
    name: "legacy-caller-specialization",
    nonStrictScript: true,
    source: `${prelude}
function f() { return read(f); }
function read(value) {
  var seen = [];
  var shapes = [{ caller: "data" }, value, { caller: "data" }, value];
  for (var i = 0; i < shapes.length; i++) seen.push(nm(shapes[i].caller));
  return seen.join();
}
console.log("guarded reads", (function g() { return f(); })());
function add(a, b) { return a + b; }
function sum() {
  var total = 0;
  for (var i = 0; i < 4; i++) total = add(total, i);
  return total + " " + nm(add.caller);
}
console.log("loop", (function g() { return sum(); })());
`,
  },
  {
    name: "cross-realm-legacy-caller",
    nonStrictScript: true,
    test262Host: true,
    source: `${prelude}
var other = $262.createRealm().global;
function target() { return nm(target.caller); }
console.log("other call", (function g() {
  return other.Function.prototype.call.call(target, null);
})());
console.log("other apply", (function g() {
  return other.Reflect.apply(target, null, []);
})());
console.log("other bind", (function g() {
  return other.Function.prototype.bind.call(target, null)();
})());
console.log("other map", (function g() {
  return other.Array.prototype.map.call([0], target)[0];
})());
function reads() {
  return [
    nm(other.Reflect.get(reads, "caller")),
    Object.getPrototypeOf(other.Reflect.get(reads, "arguments")) ===
      other.Object.prototype,
    Object.getPrototypeOf(reads.arguments) === Object.prototype,
    other.Reflect.get(reads, "arguments")[Symbol.iterator] ===
      other.Array.prototype.values,
    (function (d) { return [nm(d.value), d.writable, d.enumerable].join(); })(
      other.Object.getOwnPropertyDescriptor(reads, "caller")),
    other.Reflect.ownKeys(reads).join(),
  ].join(" | ");
}
console.log("other reads", (function g() { return reads(1); })());
`,
  },
];
