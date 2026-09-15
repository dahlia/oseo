import type { Fixture } from "../fixture.ts";

export const setCompositionMethodFixtures: readonly Fixture[] = [
  {
    name: "set-composition-methods",
    source: `
const methodNames = [
  "union",
  "intersection",
  "difference",
  "symmetricDifference",
  "isSubsetOf",
  "isSupersetOf",
  "isDisjointFrom",
];
for (const name of methodNames) {
  const descriptor = Object.getOwnPropertyDescriptor(Set.prototype, name);
  let constructible = true;
  try {
    new descriptor.value(new Set());
  } catch (error) {
    constructible = !(error instanceof TypeError);
  }
  console.log(
    "metadata",
    name,
    typeof descriptor.value,
    descriptor.value.name,
    descriptor.value.length,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
    Object.prototype.hasOwnProperty.call(descriptor.value, "prototype"),
    constructible,
  );
}

function show(value) {
  if (typeof value === "boolean") return String(value);
  const parts = [];
  for (const element of value) {
    parts.push(Object.is(element, -0) ? "-0" : String(element));
  }
  return "[" + parts.join(",") + "]";
}

const left = new Set([1, 2, 3, -0, NaN]);
const right = new Set([3, 4, 0, NaN, 5]);
for (const name of methodNames) {
  console.log("sets", name, show(left[name](right)), show(right[name](left)));
}
console.log(
  "fresh results",
  left.union(right) !== left,
  left.intersection(left) !== left,
  Object.getPrototypeOf(left.difference(right)) === Set.prototype,
  left.symmetricDifference(right).size,
);
const map = new Map([[4, "four"], [1, "one"], [-0, "zero"]]);
console.log(
  "map operand",
  show(left.union(map)),
  show(left.intersection(map)),
  show(left.difference(map)),
  show(left.symmetricDifference(map)),
  left.isSupersetOf(map),
  new Set([1]).isSubsetOf(map),
  new Set([9]).isDisjointFrom(map),
);

function setLike(values, size, log) {
  return {
    get size() {
      log.push("size");
      return size;
    },
    get has() {
      log.push("get has");
      return function (value) {
        log.push("has " + show([value]));
        return values.includes(value);
      };
    },
    get keys() {
      log.push("get keys");
      return function () {
        log.push("keys");
        let index = 0;
        return {
          get next() {
            log.push("get next");
            return function () {
              log.push("next");
              const done = index >= values.length;
              const value = done ? undefined : values[index];
              index = index + 1;
              return { done, value };
            };
          },
          return() {
            log.push("return");
            return {};
          },
        };
      };
    },
  };
}

for (const name of methodNames) {
  for (const size of [1, 2, 5]) {
    const log = [];
    const receiver = new Set(["a", "b"]);
    const result = receiver[name](setLike(["b", "c"], size, log));
    console.log("order", name, size, show(result), log.join(" "));
  }
}

const sizeLog = [];
const sizeObject = {
  valueOf() {
    sizeLog.push("valueOf");
    return 2.9;
  },
};
console.log(
  "size conversion",
  show(new Set([1, 2, 3]).intersection(setLike([2], sizeObject, sizeLog))),
  sizeLog.join(" "),
);
console.log(
  "size forms",
  show(new Set([1, 2]).union(setLike([3], "1", []))),
  new Set([1, 2]).isSubsetOf(setLike([1, 2], Infinity, [])),
  new Set([1]).isSupersetOf(setLike([], -0.5, [])),
  show(new Set([1, 2]).difference(setLike([1], true, []))),
);

function outcome(thunk) {
  try {
    return "value " + show(thunk());
  } catch (error) {
    return error.constructor.name;
  }
}
const receiver = new Set([1, 2]);
const invalidOperands = [
  ["undefined", undefined],
  ["number", 3],
  ["array", [1, 2]],
  ["missing size", { has() {}, keys() {} }],
  ["NaN size", { size: NaN, has() {}, keys() {} }],
  ["negative size", { size: -1, has() {}, keys() {} }],
  ["negative infinity", { size: -Infinity, has() {}, keys() {} }],
  ["bigint size", { size: 1n, has() {}, keys() {} }],
  ["symbol size", { size: Symbol("size"), has() {}, keys() {} }],
  ["has missing", { size: 1, keys() {} }],
  ["has not callable", { size: 1, has: 1, keys() {} }],
  ["keys missing", { size: 1, has() {} }],
  ["keys not callable", { size: 1, has() {}, keys: {} }],
];
for (const [label, operand] of invalidOperands) {
  const outcomes = methodNames.map((name) =>
    outcome(() => receiver[name](operand)),
  );
  console.log("invalid", label, outcomes.join(" "));
}

const brandLog = [];
for (const name of methodNames) {
  console.log(
    "brand",
    name,
    outcome(() =>
      Set.prototype[name].call(new Map([[1, 1]]), setLike([], 0, brandLog)),
    ),
    outcome(() => Set.prototype[name].call({}, new Set())),
  );
}
console.log("brand before argument", brandLog.length);

function keysReturning(iterator, size) {
  return { size, has() { return false; }, keys() { return iterator; } };
}
for (const name of methodNames) {
  console.log(
    "keys iterator",
    name,
    outcome(() => new Set([1, 2, 3])[name](keysReturning(7, 1))),
    outcome(() => new Set([1, 2, 3])[name](keysReturning({ next: 1 }, 1))),
    outcome(() =>
      new Set([1, 2, 3])[name](
        keysReturning({ next() { return 1; } }, 1),
      ),
    ),
  );
}

class Probe extends Error {}
function throwingHas(size) {
  return {
    size,
    has() { throw new Probe("has"); },
    keys() { return [][Symbol.iterator](); },
  };
}
function throwingNext(log) {
  return {
    size: 0,
    has() { return false; },
    keys() {
      return {
        next() { throw new Probe("next"); },
        return() {
          log.push("return");
          return {};
        },
      };
    },
  };
}
for (const name of methodNames) {
  const log = [];
  console.log(
    "abrupt",
    name,
    outcome(() => new Set([1])[name](throwingHas(4))),
    outcome(() => new Set([1, 2])[name](throwingNext(log))),
    log.length,
  );
}

function closing(values, log, returnBehavior) {
  return {
    size: values.length,
    has() { return false; },
    keys() {
      let index = 0;
      return {
        next() {
          index = index + 1;
          return { done: index > values.length, value: values[index - 1] };
        },
        get return() {
          log.push("get return");
          if (returnBehavior === "throw") {
            return function () { throw new Probe("return"); };
          }
          if (returnBehavior === "primitive") {
            return function () { return 1; };
          }
          if (returnBehavior === "absent") return undefined;
          return function () {
            log.push("return called");
            return {};
          };
        },
      };
    },
  };
}
for (const behavior of ["normal", "throw", "primitive", "absent"]) {
  const supersetLog = [];
  const disjointLog = [];
  console.log(
    "close",
    behavior,
    outcome(() =>
      new Set([1, 2, 3]).isSupersetOf(
        closing([1, 9, 1], supersetLog, behavior),
      ),
    ),
    supersetLog.join(" "),
    outcome(() =>
      new Set([1, 2, 3, 4]).isDisjointFrom(
        closing([7, 2], disjointLog, behavior),
      ),
    ),
    disjointLog.join(" "),
  );
}
const exhaustedLog = [];
console.log(
  "no close when exhausted",
  new Set([1, 2]).isSupersetOf(closing([2, 1], exhaustedLog, "normal")),
  new Set([1, 2, 3]).isDisjointFrom(closing([7, 8], exhaustedLog, "normal")),
  exhaustedLog.join(" "),
);

const growing = new Set([1, 2]);
const growingSeen = [];
const growingResult = growing.intersection({
  size: 10,
  has(value) {
    growingSeen.push(value);
    if (value === 1 && growingSeen.length === 1) {
      growing.delete(1);
      growing.add(3);
      growing.add(1);
    }
    return true;
  },
  keys() { throw new Probe("unused"); },
});
console.log("intersection growth", show(growingResult), growingSeen.join(","));

const shrinking = new Set([1, 2, 3]);
const shrinkingSeen = [];
const differenceResult = shrinking.difference({
  size: 10,
  has(value) {
    shrinkingSeen.push(value);
    shrinking.clear();
    shrinking.add(9);
    return value === 2;
  },
  keys() { throw new Probe("unused"); },
});
console.log(
  "difference snapshot",
  show(differenceResult),
  shrinkingSeen.join(","),
  show(shrinking),
);

const subsetReceiver = new Set([1, 2]);
const subsetSeen = [];
console.log(
  "subset growth",
  subsetReceiver.isSubsetOf({
    size: 10,
    has(value) {
      subsetSeen.push(value);
      if (value === 2) subsetReceiver.add(5);
      return value !== 5;
    },
    keys() { throw new Probe("unused"); },
  }),
  subsetSeen.join(","),
);

const disjointReceiver = new Set([1, 2]);
const disjointSeen = [];
console.log(
  "disjoint deletion",
  disjointReceiver.isDisjointFrom({
    size: 10,
    has(value) {
      disjointSeen.push(value);
      disjointReceiver.delete(2);
      return false;
    },
    keys() { throw new Probe("unused"); },
  }),
  disjointSeen.join(","),
);

const unionReceiver = new Set([1]);
function mutatingKeys(target) {
  return {
    size: 1,
    has() { return false; },
    keys() {
      target.add(8);
      let index = 0;
      const values = [2, 1, -0, 2];
      return {
        next() {
          if (index === 1) target.delete(1);
          index = index + 1;
          return { done: index > values.length, value: values[index - 1] };
        },
      };
    },
  };
}
console.log(
  "keys mutation",
  show(unionReceiver.union(mutatingKeys(unionReceiver))),
  show(new Set([1, 5]).symmetricDifference(mutatingKeys(new Set([1, 5])))),
  show(unionReceiver),
);
const symmetricReceiver = new Set([1, 5]);
console.log(
  "symmetric receiver mutation",
  show(symmetricReceiver.symmetricDifference(mutatingKeys(symmetricReceiver))),
  show(symmetricReceiver),
);
const intersectionReceiver = new Set([1, 2, 3, 0]);
console.log(
  "intersection keys branch",
  show(intersectionReceiver.intersection(mutatingKeys(intersectionReceiver))),
);

class Derived extends Set {
  static get [Symbol.species]() {
    throw new Probe("species");
  }
  add() {
    throw new Probe("add");
  }
  has() {
    throw new Probe("receiver has");
  }
  get size() {
    throw new Probe("receiver size");
  }
}
const derived = new Derived();
Set.prototype.add.call(derived, 1);
Set.prototype.add.call(derived, 2);
for (const name of methodNames) {
  const result = derived[name](new Set([2, 3]));
  console.log(
    "derived receiver",
    name,
    show(result),
    typeof result === "boolean" ||
      Object.getPrototypeOf(result) === Set.prototype,
  );
}
const addOne = new Set([1]);
const addTwo = new Set([2]);
const addPair = new Set([1, 2]);
const addOther = new Set([2, 3]);
const originalAdd = Set.prototype.add;
Set.prototype.add = function () {
  throw new Probe("prototype add");
};
console.log(
  "prototype add unused",
  show(addOne.union(addTwo)),
  show(addPair.symmetricDifference(addOther)),
);
Set.prototype.add = originalAdd;

const objectA = {};
const objectB = {};
console.log(
  "identity",
  new Set([objectA]).union(new Set([objectB])).size,
  new Set([objectA]).intersection(new Set([{}])).size,
  new Set([objectA, objectB]).difference(new Set([objectB])).has(objectA),
);

let pressure = 0;
const survivor = new Set([objectA]);
for (let index = 0; index < 48; index = index + 1) {
  const first = new Set([index, { index }, "item" + index]);
  const second = new Set([index + 1, "item" + index, { index }]);
  const union = first.union(second);
  const common = first.intersection(second);
  const only = first.difference(second);
  const either = first.symmetricDifference(second);
  pressure =
    pressure + union.size + common.size + only.size + either.size +
    (first.isSubsetOf(union) ? 1 : 0) +
    (union.isSupersetOf(second) ? 1 : 0) +
    (only.isDisjointFrom(second) ? 1 : 0);
}
console.log(
  "collection pressure",
  pressure,
  survivor.union(new Set()).has(objectA),
);

const shapeProbe = { size: 1, label: "shape" };
console.log("shape read", shapeProbe.size, shapeProbe.label);
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(2, 3), hinted("2", 3));
`,
  },
];
