import type { Fixture } from "../fixture.ts";

export const setIntrinsicFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "set-intrinsic",
    source: `
console.log("metadata", typeof Set, Set.name, Set.length);
const globalDescriptor = Object.getOwnPropertyDescriptor(this, "Set");
const prototypeDescriptor = Object.getOwnPropertyDescriptor(Set, "prototype");
const speciesDescriptor = Object.getOwnPropertyDescriptor(Set, Symbol.species);
const sizeDescriptor = Object.getOwnPropertyDescriptor(Set.prototype, "size");
const tagDescriptor = Object.getOwnPropertyDescriptor(
  Set.prototype,
  Symbol.toStringTag,
);
console.log(
  "descriptors",
  globalDescriptor.writable,
  globalDescriptor.enumerable,
  globalDescriptor.configurable,
  prototypeDescriptor.writable,
  prototypeDescriptor.enumerable,
  prototypeDescriptor.configurable,
  typeof speciesDescriptor.get,
  speciesDescriptor.set,
  speciesDescriptor.enumerable,
  speciesDescriptor.configurable,
  speciesDescriptor.get.name,
  speciesDescriptor.get.length,
  typeof sizeDescriptor.get,
  sizeDescriptor.set,
  sizeDescriptor.enumerable,
  sizeDescriptor.configurable,
  sizeDescriptor.get.name,
  sizeDescriptor.get.length,
  tagDescriptor.value,
  tagDescriptor.writable,
  tagDescriptor.enumerable,
  tagDescriptor.configurable,
);
console.log(
  "method identity",
  Set.prototype.keys === Set.prototype.values,
  Set.prototype[Symbol.iterator] === Set.prototype.values,
  Set[Symbol.species] === Set,
);

const firstObject = {};
const secondObject = {};
const set = new Set([3, -0, NaN, 3, NaN, firstObject, secondObject]);
console.log(
  "same-value-zero",
  set.size,
  set.has(0),
  set.has(-0),
  set.has(NaN),
  set.has({}),
);
for (const value of set) {
  console.log(
    "ordered",
    value === firstObject ? "first" : value === secondObject ? "second" : value,
  );
}
console.log("delete", set.delete(-0), set.delete(-0), set.size);
console.log("add returns receiver", set.add(0) === set, set.size);

const live = new Set([1, 2, 3]);
const liveIterator = live.values();
console.log("live first", liveIterator.next().value);
live.delete(2);
live.add(4);
console.log("live second", liveIterator.next().value);
console.log("live append", liveIterator.next().value);
live.clear();
live.add(5);
console.log("live after clear", liveIterator.next().value);
console.log("live done", liveIterator.next().done, liveIterator.next().done);

const entryIterator = new Set(["a"]).entries();
const entry = entryIterator.next().value;
console.log(
  "entry",
  entry[0],
  entry[1],
  Object.getPrototypeOf(entryIterator)[Symbol.toStringTag],
  Object.getPrototypeOf(Object.getPrototypeOf(entryIterator)) ===
    Iterator.prototype,
  entryIterator[Symbol.iterator]() === entryIterator,
);

const visited = new Set([1, 2, 3]);
const thisArg = { label: "this" };
visited.forEach(function (value, key, receiver) {
  console.log("forEach", value, key, receiver === visited, this === thisArg);
  if (value === 1) {
    visited.delete(2);
    visited.add(4);
  }
  if (value === 3) {
    visited.clear();
    visited.add(5);
  }
}, thisArg);
console.log("forEach final", visited.size, visited.has(5));

let closeCount = 0;
const closingIterable = {
  [Symbol.iterator]() {
    let value = 0;
    return {
      next() {
        value = value + 1;
        return { done: false, value };
      },
      return() {
        closeCount = closeCount + 1;
        return {};
      },
    };
  },
};
const originalAdd = Set.prototype.add;
Set.prototype.add = function (value) {
  if (value === 2) throw new EvalError("adder");
  return originalAdd.call(this, value);
};
try {
  new Set(closingIterable);
} catch (error) {
  console.log("constructor close", error instanceof EvalError, closeCount);
}
Set.prototype.add = originalAdd;

let stepCloseCount = 0;
const failingStepIterable = {
  [Symbol.iterator]() {
    return {
      next() {
        throw new EvalError("step");
      },
      return() {
        stepCloseCount = stepCloseCount + 1;
        return {};
      },
    };
  },
};
try {
  new Set(failingStepIterable);
} catch (error) {
  console.log("constructor step", error instanceof EvalError, stepCloseCount);
}

let iteratorRead = 0;
const unreadIterable = {};
Object.defineProperty(unreadIterable, Symbol.iterator, {
  get() {
    iteratorRead = iteratorRead + 1;
    return function () { return new Set().values(); };
  },
});
class BadAdderSet extends Set {}
BadAdderSet.prototype.add = 0;
try {
  new BadAdderSet(unreadIterable);
} catch (error) {
  console.log(
    "adder before iterator",
    error instanceof TypeError,
    iteratorRead,
  );
}

class DerivedSet extends Set {}
const derived = new DerivedSet([7]);
console.log(
  "derived",
  derived instanceof DerivedSet,
  derived instanceof Set,
  Object.getPrototypeOf(derived) === DerivedSet.prototype,
  derived.has(7),
);
for (const method of ["add", "clear", "delete", "entries", "forEach", "has"]) {
  try {
    Set.prototype[method].call({}, 1);
  } catch (error) {
    console.log("brand", method, error instanceof TypeError);
  }
}
try {
  Object.getOwnPropertyDescriptor(Set.prototype, "size").get.call({});
} catch (error) {
  console.log("brand size", error instanceof TypeError);
}
try {
  Object.getPrototypeOf(new Set().values()).next.call({});
} catch (error) {
  console.log("brand iterator", error instanceof TypeError);
}
try {
  Set();
} catch (error) {
  console.log("call without new", error instanceof TypeError);
}
console.log(
  "tags",
  Object.prototype.toString.call(new Set()),
  Object.prototype.toString.call(new Set().values()),
);
const setIteratorPrototype = Object.getPrototypeOf(new Set().values());
const iteratorTagDescriptor = Object.getOwnPropertyDescriptor(
  setIteratorPrototype,
  Symbol.toStringTag,
);
delete Set.prototype[Symbol.toStringTag];
delete setIteratorPrototype[Symbol.toStringTag];
console.log(
  "tag fallback",
  Object.prototype.toString.call(new Set()),
  Object.prototype.toString.call(new Set().values()),
);
Object.defineProperty(Set.prototype, Symbol.toStringTag, tagDescriptor);
Object.defineProperty(
  setIteratorPrototype,
  Symbol.toStringTag,
  iteratorTagDescriptor,
);

let pressure = 0;
const survivor = new Set([firstObject]);
for (let index = 0; index < 64; index = index + 1) {
  const temporary = new Set([index, { index }]);
  temporary.delete(index);
  temporary.add(index + 1);
  pressure = pressure + temporary.size;
}
console.log("collection pressure", pressure, survivor.has(firstObject));

/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3));

const originalSet = Set;
console.log("global read", Set === originalSet);
Set = 7;
console.log("global write", Set, this.Set === Set);
Set = originalSet;
console.log("global restore", Set === originalSet);
console.log("global delete", delete this.Set, "Set" in this);
try {
  Set;
} catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
this.Set = originalSet;
console.log("global reinstall", Set === originalSet);
`,
  },
];
