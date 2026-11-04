import type { Fixture } from "../fixture.ts";

/**
 * A fixed native fixture of the `annexb-object-accessors` unit, run by
 * tests/annexb-object-accessors-native.test.ts.
 */
export interface AnnexbObjectAccessorsFixture extends Fixture {
  /**
   * Compare with Node.js alone. Deno 2.9.7 replaces the `__proto__`
   * accessor with a warning shim that never changes a prototype, so it is
   * no reference for the accessor's bodies.
   */
  readonly nodeOnly?: true;
  /** Compile with the test262 host so the program can create realms. */
  readonly test262Host?: true;
}

/*
 * The accessor of ECMA-262 20.1.3.8 and the four legacy methods of
 * 20.1.3.9 through 20.1.3.12. Each program warms a property read on
 * differently shaped receivers before its first Annex B access, so the
 * enabled policy reaches the compiled generic fallback through a guard
 * miss.
 */
type Fixtures = readonly AnnexbObjectAccessorsFixture[];

export const annexbObjectAccessorsFixtures: Fixtures = [
  {
    name: "annexb-proto-accessor",
    nodeOnly: true,
    source: `
function read(value) { return value.__proto__; }
function write(target, value) { target.__proto__ = value; return target; }
const parent = { tag: "parent" };
const own = { ["__proto__"]: "own" };
console.log("own data", read(own), read({}) === Object.prototype);
const child = write({}, parent);
console.log("assign", Object.getPrototypeOf(child) === parent, child.tag,
  read(child) === parent, Object.hasOwn(child, "__proto__"));
write(child, 1);
write(child, "s");
write(child, undefined);
console.log("ignored", Object.getPrototypeOf(child) === parent);
write(child, null);
console.log("null", Object.getPrototypeOf(child), read(child));
console.log("primitives", read(1) === Number.prototype,
  read("s") === String.prototype, read(true) === Boolean.prototype,
  read(1n) === BigInt.prototype, read(Symbol()) === Symbol.prototype);
const descriptor = Object.getOwnPropertyDescriptor(Object.prototype,
  "__proto__");
console.log("descriptor", typeof descriptor.get, typeof descriptor.set,
  descriptor.enumerable, descriptor.configurable,
  descriptor.get.name, descriptor.set.name, descriptor.get.length,
  descriptor.set.length);
console.log("setter primitive", descriptor.set.call(1, {}),
  descriptor.set.call("s", null), descriptor.set.call({}, 1));
for (const receiver of [undefined, null]) {
  try { descriptor.get.call(receiver); } catch (error) {
    console.log("get nullish", error.constructor === TypeError);
  }
  try { descriptor.set.call(receiver, {}); } catch (error) {
    console.log("set nullish", error.constructor === TypeError);
  }
}
const a = {};
const b = Object.create(a);
try { a.__proto__ = b; } catch (error) {
  console.log("cycle", error.constructor === TypeError,
    Object.getPrototypeOf(a) === Object.prototype);
}
const sealed = Object.preventExtensions({});
try { sealed.__proto__ = parent; } catch (error) {
  console.log("non-extensible", error.constructor === TypeError);
}
sealed.__proto__ = Object.prototype;
console.log("same prototype", Object.getPrototypeOf(sealed) ===
  Object.prototype);
try { Object.prototype.__proto__ = {}; } catch (error) {
  console.log("immutable", error.constructor === TypeError);
}
Object.prototype.__proto__ = null;
console.log("immutable same", Object.getPrototypeOf(Object.prototype));
const receiver = {};
console.log("reflect set", Reflect.set({}, "__proto__", parent, receiver),
  Object.getPrototypeOf(receiver) === parent);
console.log("reflect get", Reflect.get(Object.prototype, "__proto__",
  child) === null, Reflect.get({}, "__proto__", 1) === Number.prototype);
class Base {}
class Derived extends Base {
  move(target) { super.__proto__ = target; return super.__proto__; }
}
const instance = new Derived();
const moved = instance.move(parent);
console.log("super", Object.getPrototypeOf(instance) === parent,
  moved === parent);
const log = [];
const handler = {
  getPrototypeOf(target) { log.push("getPrototypeOf");
    return Reflect.getPrototypeOf(target); },
  setPrototypeOf(target, value) { log.push("setPrototypeOf");
    return Reflect.setPrototypeOf(target, value); },
  get(target, key, receiver) { log.push("get " + String(key));
    return Reflect.get(target, key, receiver); },
  set(target, key, value, receiver) { log.push("set " + String(key));
    return Reflect.set(target, key, value, receiver); },
};
const traced = new Proxy({}, handler);
traced.__proto__ = parent;
console.log("proxy traps", log.join(","), read(traced) === parent,
  log.join(","));
const transparent = new Proxy({}, {});
transparent.__proto__ = parent;
console.log("proxy forward", Object.getPrototypeOf(transparent) === parent,
  read(transparent) === parent);
const refusing = new Proxy({}, { setPrototypeOf() { return false; } });
try { refusing.__proto__ = parent; } catch (error) {
  console.log("proxy refusal", error.constructor === TypeError);
}
const assigned = Object.assign({}, { ["__proto__"]: parent });
console.log("assign source", Object.getPrototypeOf(assigned) === parent,
  Object.hasOwn(assigned, "__proto__"));
const spread = { ...{ ["__proto__"]: parent } };
console.log("spread", Object.getPrototypeOf(spread) === Object.prototype,
  Object.hasOwn(spread, "__proto__"));
const parsed = JSON.parse('{"__proto__": 1}');
console.log("json", Object.hasOwn(parsed, "__proto__"), read(parsed));
const literal = { __proto__: parent };
const computed = { ["__proto__"]: parent };
const __proto__ = parent;
const shorthand = { __proto__ };
console.log("literals", Object.getPrototypeOf(literal) === parent,
  Object.getPrototypeOf(computed) === Object.prototype,
  Object.getPrototypeOf(shorthand) === Object.prototype);
const view = new Uint8Array(4);
console.log("typed array", read(view) === Uint8Array.prototype,
  read(read(view)) === Object.getPrototypeOf(Int8Array.prototype));
view.__proto__ = parent;
console.log("typed array set", Object.getPrototypeOf(view) === parent);
const keys = [];
for (const key in Object.prototype) keys.push(key);
console.log("for-in", keys.length, Object.keys(Object.prototype).length,
  Object.prototype.propertyIsEnumerable("__proto__"));
console.log("bound", descriptor.get.bind(1)() === Number.prototype,
  Reflect.apply(descriptor.get, "s", []) === String.prototype,
  new Proxy(descriptor.get, {}).call(true) === Boolean.prototype);
`,
  },
  {
    name: "annexb-proto-accessor-redefinition",
    nodeOnly: true,
    test262Host: true,
    source: `
function read(value) { return value.__proto__; }
read({ ["__proto__"]: 1 });
const P = Object.prototype;
const original = Object.getOwnPropertyDescriptor(P, "__proto__");
const parent = { tag: "parent" };
const copy = {};
Object.defineProperty(copy, "moved", original);
const target = Object.create(copy);
target.moved = parent;
console.log("copied", Object.getPrototypeOf(target) === parent,
  target.moved === parent, copy.moved === Object.prototype);
console.log("delete", delete P.__proto__, Object.hasOwn(P, "__proto__"),
  read({}));
const plain = {};
plain.__proto__ = parent;
console.log("after delete", Object.hasOwn(plain, "__proto__"),
  Object.getPrototypeOf(plain) === Object.prototype);
Object.defineProperty(P, "__proto__", original);
const restored = {};
restored.__proto__ = parent;
console.log("restored", Object.getPrototypeOf(restored) === parent,
  Reflect.ownKeys(P).at(-1));
Object.defineProperty(P, "__proto__", { get: undefined });
console.log("no getter", read({}), Object.getOwnPropertyDescriptor(P,
  "__proto__").set === original.set);
Object.defineProperty(P, "__proto__", original);
const other = $262.createRealm().global;
const foreign = Object.getOwnPropertyDescriptor(other.Object.prototype,
  "__proto__");
console.log("realms", foreign.get !== original.get,
  foreign.set !== original.set,
  Object.getPrototypeOf(foreign.get) === other.Function.prototype);
const local = {};
foreign.set.call(local, parent);
console.log("foreign setter", Object.getPrototypeOf(local) === parent,
  foreign.get.call(local) === parent);
const foreignObject = new other.Object();
console.log("foreign object", read(foreignObject) === other.Object.prototype,
  original.get.call(foreignObject) === other.Object.prototype);
delete other.Object.prototype.__proto__;
console.log("foreign delete", read(foreignObject),
  read({}) === Object.prototype);
Object.freeze(P);
console.log("frozen", Object.isFrozen(P),
  Object.getOwnPropertyDescriptor(P, "__proto__").configurable);
const late = {};
late.__proto__ = parent;
console.log("frozen setter", Object.getPrototypeOf(late) === parent);
`,
  },
  {
    name: "annexb-legacy-accessor-methods",
    source: `
function read(value, key) { return value[key]; }
read({ a: 1 }, "a");
read([], "length");
const methods = ["__defineGetter__", "__defineSetter__", "__lookupGetter__",
  "__lookupSetter__"];
for (const name of methods) {
  const fn = Object.prototype[name];
  const d = Object.getOwnPropertyDescriptor(Object.prototype, name);
  let constructed = "no";
  try { new fn("x", function () {}); constructed = "yes"; }
  catch (error) { constructed = error.constructor.name; }
  console.log(name, typeof fn, fn.name, fn.length, d.writable,
    d.enumerable, d.configurable, Object.hasOwn(fn, "prototype"),
    constructed, Object.getPrototypeOf(fn) === Function.prototype);
}
const log = [];
const key = { toString() { log.push("key"); return "k"; } };
const target = {};
function getter() { return "got " + (this === target); }
function setter(value) { log.push("set " + value); }
console.log("define", target.__defineGetter__(key, getter),
  log.join(","));
target.__defineSetter__("k", setter);
const desc = Object.getOwnPropertyDescriptor(target, "k");
console.log("descriptor", desc.get === getter, desc.set === setter,
  desc.enumerable, desc.configurable, target.k);
target.k = 3;
console.log("setter", log.join(","));
log.length = 0;
try { target.__defineGetter__(key, 1); } catch (error) {
  console.log("noncallable", error.constructor.name, log.length);
}
try { target.__defineSetter__(key, {}); } catch (error) {
  console.log("noncallable setter", error.constructor.name, log.length);
}
const data = { k: 1 };
data.__defineGetter__("k", getter);
console.log("replaces data", Object.getOwnPropertyDescriptor(data, "k")
  .set, typeof Object.getOwnPropertyDescriptor(data, "k").get);
const fixed = Object.defineProperty({}, "k", { value: 1 });
try { fixed.__defineGetter__("k", getter); } catch (error) {
  console.log("non-configurable", error.constructor.name);
}
const closed = Object.preventExtensions({});
try { closed.__defineSetter__("k", setter); } catch (error) {
  console.log("non-extensible", error.constructor.name);
}
const symbol = Symbol("s");
target.__defineGetter__(symbol, getter);
target.__defineGetter__(1, getter);
console.log("keys", typeof Object.getOwnPropertyDescriptor(target, symbol)
  .get, typeof Object.getOwnPropertyDescriptor(target, "1").get);
console.log("lookup", target.__lookupGetter__("k") === getter,
  target.__lookupSetter__("k") === setter, data.__lookupSetter__("k"),
  target.__lookupGetter__("missing"), ({ k: 1 }).__lookupGetter__("k"));
const child = Object.create(Object.create(target));
console.log("inherited", child.__lookupGetter__("k") === getter,
  child.__lookupSetter__(symbol), child.__lookupGetter__(1) === getter);
const shadow = Object.create(target, { k: { value: 0 } });
console.log("shadow", shadow.__lookupGetter__("k"),
  shadow.__lookupSetter__("k"));
console.log("primitive", (1).__lookupGetter__("toString"),
  "ab".__lookupGetter__("0"), "ab".__lookupGetter__("length"),
  (1).__defineGetter__("x", getter), (1).x);
const trap = [];
const proxy = new Proxy(Object.create(target), {
  getOwnPropertyDescriptor(t, k) { trap.push("gopd " + String(k));
    return Reflect.getOwnPropertyDescriptor(t, k); },
  getPrototypeOf(t) { trap.push("proto"); return Reflect.getPrototypeOf(t); },
  defineProperty(t, k, d) {
    trap.push("define " + String(k) + " " + Object.keys(d).join("/"));
    return Reflect.defineProperty(t, k, d); },
});
console.log("proxy lookup", proxy.__lookupGetter__("k") === getter,
  trap.join(","));
trap.length = 0;
proxy.__defineSetter__("p", setter);
console.log("proxy define", trap.join(","));
const refusing = new Proxy({}, { defineProperty() { return false; } });
try { refusing.__defineGetter__("k", getter); } catch (error) {
  console.log("proxy refusal", error.constructor.name);
}
for (const name of methods) {
  for (const receiver of [undefined, null]) {
    try { Object.prototype[name].call(receiver, "k", getter); }
    catch (error) { log.push(name + " " + error.constructor.name); }
  }
}
console.log("nullish", log.slice(-8).join(","));
const order = [];
try {
  Object.prototype.__lookupGetter__.call(null,
    { toString() { order.push("key"); return "k"; } });
} catch (error) { order.push(error.constructor.name); }
console.log("lookup order", order.join(","));
`,
  },
];
