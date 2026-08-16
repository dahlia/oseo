import type { Fixture } from "../fixture.ts";

export const mapIntrinsicFixtures: readonly Fixture[] = [
  {
    name: "map-intrinsic",
    source: `
function joinList(list, separator) {
  let result = "";
  let index = 0;
  for (const item of list) {
    if (index > 0) result = result + separator;
    result = result + item;
    index = index + 1;
  }
  return result;
}
console.log("metadata", typeof Map, Map.name, Map.length);
for (const [name, length] of [
  ["get", 1], ["set", 2], ["has", 1], ["delete", 1], ["clear", 0],
  ["forEach", 1], ["entries", 0], ["keys", 0], ["values", 0],
  ["groupBy", 2],
]) {
  const method = name === "groupBy" ? Map[name] : Map.prototype[name];
  console.log("method", name, method.name, method.length);
}
const sizeDescriptor = Object.getOwnPropertyDescriptor(
  Map.prototype,
  "size",
);
console.log(
  "size descriptor",
  typeof sizeDescriptor.get,
  typeof sizeDescriptor.set,
  sizeDescriptor.enumerable,
  sizeDescriptor.configurable,
);
console.log(
  "tag",
  Map.prototype[Symbol.toStringTag],
  Map.prototype.constructor === Map,
  Map.prototype.entries === Map.prototype[Symbol.iterator],
);

const empty = new Map();
console.log("empty", empty.size, empty instanceof Map);
const seeded = new Map([[1, "one"], [2, "two"]]);
console.log("seeded", seeded.size, seeded.get(1), seeded.get(2));

const key = {};
const map = new Map();
console.log("set chain", map.set("a", 1) === map);
map.set("a", 2).set(key, "object").set(NaN, "nan").set(-0, "zero");
console.log(
  "same-value-zero",
  map.get("a"),
  map.get(key),
  map.get(NaN),
  map.has(NaN),
  map.get(0),
  map.get(-0),
  map.has(+0),
);
map.set(0, "plus-zero-updates-same-entry");
console.log("zero identity", map.get(-0), map.size);
console.log(
  "identity keys",
  map.has({}),
  map.get(key) === "object",
);

const order = new Map();
order.set("x", 1).set("y", 2).set("z", 3);
console.log("insertion order", joinList([...order.keys()], ","));
order.delete("y");
order.set("y", 20);
console.log("reinsertion order", joinList([...order.keys()], ","));
console.log("delete missing", order.delete("missing"));
console.log("delete present", order.delete("x"), order.has("x"));
order.clear();
console.log("cleared", order.size, joinList([...order.keys()], ","));

const entriesOut = [];
for (const [k, v] of seeded) entriesOut.push(k + "=" + v);
console.log("default iterator", joinList(entriesOut, ","));
console.log(
  "entries values",
  joinList([...seeded.entries()].map((entry) => joinList(entry, ":")), ","),
);
console.log("values", joinList([...seeded.values()], ","));

const forEachSeen = [];
const forEachMap = new Map([["a", 1], ["b", 2]]);
let forEachTurn = 0;
forEachMap.forEach(function (value, mapKey, target) {
  forEachSeen.push(mapKey + ":" + value + ":" + (target === forEachMap));
  forEachTurn = forEachTurn + 1;
  if (forEachTurn === 1) forEachMap.set("c", 3);
  if (mapKey === "b") forEachMap.delete("b");
  if (mapKey === "c") {
    forEachMap.delete("a");
    forEachMap.set("a", 100);
  }
});
console.log("forEach order", joinList(forEachSeen, "|"));
const forEachReturn = new Map([["a", 1]]).forEach(function () {
  return true;
});
console.log("forEach return", forEachReturn === undefined);
const thisArg = { tag: "context" };
let observedThis;
new Map([["k", "v"]]).forEach(function () {
  observedThis = this;
}, thisArg);
console.log("forEach thisArg", observedThis === thisArg);
try {
  new Map().forEach(1);
} catch (error) {
  console.log("forEach not callable", error instanceof TypeError);
}

const groups = Map.groupBy([1, 2, 3, 4, 5], (value) =>
  value % 2 === 0 ? "even" : "odd");
console.log(
  "groupBy",
  groups instanceof Map,
  joinList(groups.get("even"), ","),
  joinList(groups.get("odd"), ","),
);
const zeroGroups = Map.groupBy([-0, 0, 1], (value) => (value === 0 ? -0 : 1));
console.log(
  "groupBy negative zero",
  zeroGroups.size,
  zeroGroups.get(0).length,
  zeroGroups.get(1).length,
);
const objectGroupKey = {};
const objectGroups = Map.groupBy([10], () => objectGroupKey);
console.log(
  "groupBy object key",
  objectGroups.has(objectGroupKey),
  joinList(objectGroups.get(objectGroupKey), ","),
);
try {
  Map.groupBy([1], null);
} catch (error) {
  console.log("groupBy not callable", error instanceof TypeError);
}

for (const method of [
  "get", "set", "has", "delete", "clear", "forEach", "keys", "values",
  "entries",
]) {
  try {
    Map.prototype[method].call({});
  } catch (error) {
    console.log("branding", method, error instanceof TypeError);
  }
}
try {
  Object.getOwnPropertyDescriptor(Map.prototype, "size").get.call({});
} catch (error) {
  console.log("branding size", error instanceof TypeError);
}

const keysIterator = new Map([["a", 1]]).keys();
const valuesIterator = new Map([["a", 1]]).values();
const entriesIterator = new Map([["a", 1]]).entries();
const keysProto = Object.getPrototypeOf(keysIterator);
console.log(
  "iterator identity",
  keysProto === Object.getPrototypeOf(valuesIterator),
  keysProto === Object.getPrototypeOf(entriesIterator),
  Object.getPrototypeOf(keysProto) === Iterator.prototype,
  keysProto[Symbol.toStringTag],
);
const mapIteratorNextDescriptor = Object.getOwnPropertyDescriptor(
  keysProto,
  "next",
);
console.log(
  "map iterator next",
  mapIteratorNextDescriptor.value.name,
  mapIteratorNextDescriptor.value.length,
);
try {
  keysProto.next.call({});
} catch (error) {
  console.log("map iterator branding", error instanceof TypeError);
}
const exhausted = new Map().keys();
console.log(
  "exhausted",
  exhausted.next().done,
  exhausted.next().value,
  exhausted.next().done,
);

class NonCallableAdder extends Map {}
Object.defineProperty(NonCallableAdder.prototype, "set", { value: 7 });
const nullishSkipsRead = new NonCallableAdder();
console.log(
  "nullish iterable skips set read",
  nullishSkipsRead instanceof Map,
  nullishSkipsRead.size,
);
try {
  new NonCallableAdder([[1, 2]]);
} catch (error) {
  console.log("set not callable when read", error instanceof TypeError);
}

class ThrowingSetGetter extends Map {
  get set() {
    throw new RangeError("set getter failure");
  }
}
try {
  new ThrowingSetGetter([[1, 2]]);
} catch (error) {
  console.log("get-set method failure", error instanceof RangeError);
}

let iterableClosed = false;
const closingIterable = {
  [Symbol.iterator]() {
    return {
      next() {
        return { value: [1, 2], done: false };
      },
      return() {
        iterableClosed = true;
        return { done: true };
      },
    };
  },
};
class ThrowingAdder extends Map {
  set() {
    throw new RangeError("adder failure");
  }
}
try {
  new ThrowingAdder(closingIterable);
} catch (error) {
  console.log(
    "iterator closes after set failure",
    error instanceof RangeError,
    iterableClosed,
  );
}
try {
  new Map([1, 2]);
} catch (error) {
  console.log("non-object entry", error instanceof TypeError);
}
try {
  new Map([{ get 0() { throw new TypeError("k"); }, 1: "v" }]);
} catch (error) {
  console.log("abrupt key read", error instanceof TypeError);
}
try {
  new Map([{ 0: "k", get 1() { throw new TypeError("v"); } }]);
} catch (error) {
  console.log("abrupt value read", error instanceof TypeError);
}

const speciesDescriptor = Object.getOwnPropertyDescriptor(
  Map,
  Symbol.species,
);
console.log(
  "species",
  typeof speciesDescriptor.get,
  typeof speciesDescriptor.set,
  speciesDescriptor.enumerable,
  speciesDescriptor.configurable,
  speciesDescriptor.get.call(Map) === Map,
  speciesDescriptor.get.call(Number) === Number,
);

const shapedOne = new Map();
shapedOne.tag = "shaped";
const shapedTwo = new Map();
const cacheTargets = [shapedOne, shapedOne, shapedTwo, shapedTwo];
let cacheTurn = 0;
while (cacheTurn < cacheTargets.length) {
  const target = cacheTargets[cacheTurn];
  console.log("cache", cacheTurn, target.get.call(target, "missing"));
  cacheTurn = cacheTurn + 1;
}
`,
  },
];
