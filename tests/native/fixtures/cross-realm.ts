import type { Fixture } from "../fixture.ts";

/*
 * Realms beyond the initial realm through the test262 host's
 * `$262.createRealm` (ADR 0027). The native side creates each realm in the
 * running context; Node.js and Deno create a `node:vm` context through the
 * reference prelude. Every observation compares identities and error
 * constructors rather than printing realm-specific objects, because the
 * reference hosts and the native runtime agree on which realm owns a value
 * but not on how a host object prints.
 */
export const crossRealmFixtures: readonly Fixture[] = [
  {
    name: "cross-realm-intrinsics",
    test262Host: true,
    source: `
const other = $262.createRealm().global;
const third = $262.createRealm().global;
console.log(
  $262.global === globalThis,
  other === globalThis,
  other.globalThis === other,
  typeof other.Array,
  other.Array === Array,
  other.Array === third.Array,
  other.Object.prototype === Object.prototype,
  Object.getPrototypeOf(other.Array) === other.Function.prototype,
);
const names = [
  "asyncIterator", "hasInstance", "isConcatSpreadable", "iterator",
  "match", "matchAll", "replace", "search", "species", "split",
  "toPrimitive", "toStringTag", "unscopables",
];
console.log(names.every((name) => other.Symbol[name] === Symbol[name]));
const local = Symbol.for("local");
const foreign = other.Symbol.for("foreign");
console.log(
  other.Symbol.for === Symbol.for,
  other.Symbol.for("local") === local,
  Symbol.for("foreign") === foreign,
  other.Symbol.keyFor(local),
  Symbol.keyFor(foreign),
);
const array = new other.Array(1, 2, 3);
console.log(
  Object.getPrototypeOf(array) === other.Array.prototype,
  Array.isArray(array),
  array instanceof Array,
  array instanceof other.Array,
  array.map((x) => x * 2) instanceof other.Array,
  Array.prototype.map.call(array, (x) => x) instanceof Array,
);
const wrapped = other.Object(other.BigInt(7));
console.log(
  Object.getPrototypeOf(wrapped) === other.BigInt.prototype,
  BigInt.prototype.valueOf.call(wrapped) === 7n,
  Number.prototype.valueOf.call(other.Object(5)),
  String.prototype.valueOf.call(new other.String("s")),
  Boolean.prototype.valueOf.call(new other.Boolean(true)),
);
console.log(
  typeof globalThis.eval,
  globalThis.eval === other.eval,
  globalThis.eval.length,
  globalThis.eval.name,
  other.eval(42),
  other.eval(local) === local,
  globalThis.eval() === undefined,
);
const evalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "eval");
console.log(
  evalDescriptor.writable,
  evalDescriptor.enumerable,
  evalDescriptor.configurable,
  Object.getPrototypeOf(other.eval) === other.Function.prototype,
);
try {
  new other.eval();
} catch (error) {
  console.log("new eval", error instanceof TypeError);
}
const thrower = Object.getOwnPropertyDescriptor(Function.prototype, "caller")
  .get;
const otherThrower = Object.getOwnPropertyDescriptor(
  other.Function.prototype,
  "caller",
).get;
console.log(
  thrower === otherThrower,
  Object.getPrototypeOf(otherThrower) === other.Function.prototype,
);
try {
  otherThrower();
} catch (error) {
  console.log("thrower", error instanceof other.TypeError);
}
`,
  },
  {
    name: "cross-realm-errors",
    test262Host: true,
    source: `
const other = $262.createRealm().global;
function realmOf(callback) {
  try {
    callback();
    return "none";
  } catch (error) {
    if (error instanceof other.TypeError) return "other";
    if (error instanceof TypeError) return "local";
    if (error instanceof other.RangeError) return "other-range";
    if (error instanceof RangeError) return "local-range";
    return "value:" + String(error);
  }
}
const otherToString = other.String.prototype.toString;
const otherApply = other.Function.prototype.apply;
const localGlobal = Object.getOwnPropertyDescriptor(RegExp.prototype, "global")
  .get;
const otherGlobal = Object.getOwnPropertyDescriptor(
  other.RegExp.prototype,
  "global",
).get;
console.log(
  realmOf(() => otherToString.call(1)),
  realmOf(() => "x".concat({ toString: otherToString })),
  realmOf(() => otherApply.call({}, {}, [])),
  realmOf(() => otherGlobal.call(RegExp.prototype)),
  realmOf(() => localGlobal.call(other.RegExp.prototype)),
  otherGlobal.call(other.RegExp.prototype),
  otherGlobal.call(/a/g),
  localGlobal.call(new other.RegExp("a", "g")),
);
const otherArray = new other.Array();
console.log(
  realmOf(() => {
    otherArray.length = 4294967296;
  }),
  realmOf(() => {
    other.Array.prototype.forEach.call([1], () => {
      throw new TypeError("local callback");
    });
  }),
  realmOf(() => other.Array.prototype.forEach.call([1], 1)),
  realmOf(() => other.JSON.stringify(1n)),
  realmOf(() => JSON.stringify(other.Object(other.BigInt(1)))),
);
const joined = [Symbol()];
joined.join = other.Array.prototype.join;
const listed = [1, [2]];
listed.join = other.Array.prototype.join;
console.log(
  realmOf(() => String(joined)),
  realmOf(() => \`\${joined}\`),
  String(listed),
);
other.BigInt.prototype.toJSON = function () {
  return this.toString();
};
console.log(JSON.stringify(other.Object(other.BigInt(100))));
const revocable = other.Proxy.revocable([], {});
revocable.revoke();
console.log(
  realmOf(() => JSON.stringify({}, revocable.proxy)),
  realmOf(() => Array.isArray(revocable.proxy)),
);
class Local {}
console.log(
  realmOf(() => other.Reflect.apply(Local, undefined, [])),
  realmOf(() => Local()),
);
`,
  },
  {
    name: "cross-realm-construction",
    test262Host: true,
    source: `
const other = $262.createRealm().global;
const third = $262.createRealm().global;
const bound = other.Object.bind();
console.log(
  "prototype" in bound,
  Object.getPrototypeOf(Reflect.construct(Date, [0], bound)) ===
    other.Date.prototype,
  Object.getPrototypeOf(Reflect.construct(Array, [], bound)) ===
    other.Array.prototype,
  Object.getPrototypeOf(Reflect.construct(Map, [], bound)) ===
    other.Map.prototype,
  Object.getPrototypeOf(Reflect.construct(Promise, [() => {}], bound)) ===
    other.Promise.prototype,
  Object.getPrototypeOf(Reflect.construct(Error, [], bound)) ===
    other.Error.prototype,
  Object.getPrototypeOf(Reflect.construct(Uint8Array, [1], bound)) ===
    other.Uint8Array.prototype,
  Object.getPrototypeOf(Reflect.construct(Boolean, [], bound)) ===
    other.Boolean.prototype,
  Object.getPrototypeOf(Reflect.construct(RegExp, ["a"], bound)) ===
    other.RegExp.prototype,
);
const twice = third.Function.prototype.bind.call(bound);
const date = Reflect.construct(third.Date, [0], twice);
console.log(
  date instanceof other.Date,
  Object.getPrototypeOf(date) === other.Date.prototype,
);
function Plain() {}
Plain.prototype = null;
console.log(
  Object.getPrototypeOf(Reflect.construct(Plain, [], bound)) ===
    other.Object.prototype,
  Object.getPrototypeOf(new Plain()) === Object.prototype,
);
const proxied = new Proxy(other.Object.bind(), {});
console.log(
  Object.getPrototypeOf(Reflect.construct(Set, [], proxied)) ===
    other.Set.prototype,
);
const revocable = other.Proxy.revocable(function () {}, {
  get() {
    revocable.revoke();
  },
});
try {
  Reflect.construct(Object, [], revocable.proxy);
} catch (error) {
  console.log(
    "revoked",
    error instanceof TypeError,
    error instanceof other.TypeError,
  );
}
const species = [];
let reads = 0;
species.constructor = other.Array;
Object.defineProperty(other.Array, Symbol.species, {
  get() {
    reads += 1;
    return undefined;
  },
});
console.log(
  Object.getPrototypeOf(species.map((x) => x)) === Array.prototype,
  Object.getPrototypeOf(species.filter(() => true)) === Array.prototype,
  Object.getPrototypeOf(species.slice()) === Array.prototype,
  Object.getPrototypeOf(species.splice(0)) === Array.prototype,
  Object.getPrototypeOf(species.concat()) === Array.prototype,
  reads,
);
function Custom() {}
const custom = [];
custom.constructor = other.Object;
other.Object[Symbol.species] = Custom;
console.log(
  Object.getPrototypeOf(custom.map((x) => x)) === Custom.prototype,
  Object.getPrototypeOf(other.Array.prototype.slice.call([1])) ===
    other.Array.prototype,
  Object.getPrototypeOf(other.Array.prototype.slice.call(new other.Array())) ===
    other.Array.prototype,
);
const nested = other.Array.of(1, 2);
nested.constructor = Array;
console.log(
  Object.getPrototypeOf(other.Array.prototype.map.call(nested, (x) => x)) ===
    other.Array.prototype,
  Object.getPrototypeOf(Array.from(nested)) === Array.prototype,
  Object.getPrototypeOf(other.Array.from.call(Array, [1])) === Array.prototype,
);
`,
  },
  {
    name: "cross-realm-jobs",
    test262Host: true,
    source: `
const other = $262.createRealm().global;
const log = [];
const foreign = other.Promise.resolve(1);
console.log(
  foreign instanceof other.Promise,
  foreign instanceof Promise,
  Promise.resolve(foreign) === foreign,
  Promise.resolve(foreign) instanceof Promise,
);
foreign.then((value) => log.push("other-then:" + value));
Promise.resolve(2).then((value) => log.push("local-then:" + value));
const thenable = {
  then: other.Function.prototype.call.bind(function (resolve) {
    resolve(3);
  }, undefined),
};
Promise.resolve(thenable).then((value) => log.push("thenable:" + value));
other.Promise.reject(new other.Error("x")).catch((error) => {
  log.push("caught:" + (error instanceof other.Error));
});
(async () => {
  const value = await other.Promise.resolve(4);
  log.push("await:" + value);
  try {
    await other.Promise.reject(new other.RangeError("r"));
  } catch (error) {
    log.push("await-throw:" + (error instanceof other.RangeError));
  }
  const all = await other.Promise.all([1, Promise.resolve(2)]);
  log.push("all:" + (all instanceof other.Array) + ":" + all.join());
  function* generator() {
    yield 1;
    yield 2;
  }
  log.push("spread:" + other.Array.from(generator()).join());
})().then(() => console.log(log.join(" ")));
`,
  },
  {
    name: "cross-realm-collection",
    test262Host: true,
    source: `
const kept = [];
let checksum = 0;
for (let index = 0; index < 5; index += 1) {
  const host = $262.createRealm();
  const global = host.global;
  const array = new global.Array(index, index + 1);
  const map = new global.Map([[index, global.Symbol.for("shared")]]);
  checksum += array.reduce((sum, value) => sum + value, 0);
  checksum += map.get(index) === Symbol.for("shared") ? 1 : 0;
  if (index % 2 === 0) kept.push({ host, array, map });
}
const nested = kept[0].host.createRealm().global;
console.log(
  checksum,
  kept.length,
  kept.every(({ host, array }) =>
    Object.getPrototypeOf(array) === host.global.Array.prototype),
  kept.every(({ host, map }) => map instanceof host.global.Map),
  kept[1].host.global.Array !== kept[2].host.global.Array,
  nested.Array !== kept[0].host.global.Array,
  new nested.Set([1, 1, 2]).size,
);
const weak = new WeakMap();
for (const { host, array } of kept) weak.set(array, host.global.String(1));
console.log(kept.map(({ array }) => weak.get(array)).join(","));
`,
  },
  {
    name: "cross-realm-property-guards",
    test262Host: true,
    source: `
const other = $262.createRealm().global;
function readX(object) {
  return object.x;
}
function readLength(object) {
  return object.length;
}
const local = { x: 1 };
const foreign = other.Object.assign(new other.Object(), { x: 2 });
const created = other.Object.create(null);
created.x = 3;
let total = 0;
for (let index = 0; index < 30; index += 1) total += readX(local);
for (let index = 0; index < 5; index += 1) total += readX(foreign);
total += readX(created);
total += readLength([1, 2]) + readLength(new other.Array(4));
total += readLength(other.Array.of(1, 2, 3));
console.log(total);
`,
  },
];
