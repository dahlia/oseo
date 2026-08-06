import type { Fixture } from "../fixture.ts";

export const arrayCtorFixtures: readonly Fixture[] = [
  {
    name: "array-constructor",
    source: `
console.log(
  "identity",
  Array.prototype.constructor === Array,
  Array.isArray(Array.prototype),
);
console.log("metadata", Array.name, Array.length);
for (const name of ["from", "isArray", "of"]) {
  const method = Array[name];
  const descriptor = Object.getOwnPropertyDescriptor(Array, name);
  console.log(
    "static",
    name,
    method.name,
    method.length,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
  );
}
const species = Object.getOwnPropertyDescriptor(Array, Symbol.species);
console.log(
  "species",
  species.get.name,
  species.get.length,
  species.get.call(Array) === Array,
  species.set,
  species.enumerable,
  species.configurable,
);

const empty = Array();
const sparse = new Array(3);
const one = Array("3");
const many = Array(1, 2, 3);
console.log(
  "construct",
  empty.length,
  sparse.length,
  0 in sparse,
  one.length,
  one[0],
  many.length,
  many[2],
);
for (const invalid of [-1, 1.5]) {
  try { Array(invalid); } catch (error) {
    console.log("invalid", error instanceof RangeError);
  }
}
try {
  Object.defineProperty([], "length", {
    configurable: true,
    value: -1,
  });
} catch (error) {
  console.log("invalid descriptor", error instanceof RangeError);
}

console.log("isArray", Array.isArray([]), Array.isArray({}));
const fromLike = Array.from({ 0: "a", 2: "c", length: 3 });
console.log(
  "from like",
  fromLike.length,
  fromLike[0],
  fromLike[1],
  fromLike[2],
);
const fromString = Array.from("Test");
console.log(
  "from string",
  fromString.length,
  fromString[0],
  fromString[1],
  fromString[2],
  fromString[3],
);
const mapThis = { offset: 10 };
const mapped = Array.from([2, 3], function (value, index) {
  return this.offset + value + index;
}, mapThis);
console.log("mapped", mapped.length, mapped[0], mapped[1]);
try { Array.from([], null); } catch (error) {
  console.log("null mapper", error instanceof TypeError);
}
try {
  Array.from.call({}, { length: 4294967296 });
} catch (error) {
  console.log("oversized like", error instanceof RangeError);
}
function ThrowingArray() { throw new RangeError("construct first"); }
const invalidIterator = {
  [Symbol.iterator]: function () { return undefined; },
};
try { Array.from.call(ThrowingArray, invalidIterator); } catch (error) {
  console.log("construct first", error instanceof RangeError);
}

let iteratorClosed = 0;
let iteratorStep = 0;
const iterable = {
  [Symbol.iterator]: function () {
    return {
      next: function () {
        iteratorStep = iteratorStep + 1;
        return iteratorStep > 2
          ? { value: undefined, done: true }
          : { value: iteratorStep * 4, done: false };
      },
      return: function () {
        iteratorClosed = iteratorClosed + 1;
        return {};
      },
    };
  },
};
const fromIterable = Array.from(iterable);
console.log(
  "from iterable",
  fromIterable.length,
  fromIterable[0],
  fromIterable[1],
);
iteratorStep = 0;
try {
  Array.from(iterable, function (value) {
    if (value === 8) throw new RangeError("stop");
    return value;
  });
} catch (error) {
  console.log("from close", error instanceof RangeError, iteratorClosed);
}

function Bag(length) { this.createdLength = length; }
const fromBag = Array.from.call(Bag, { 0: "x", length: 1 });
const ofBag = Array.of.call(Bag, "y", "z");
console.log(
  "generic",
  fromBag instanceof Bag,
  fromBag.createdLength,
  fromBag.length,
  fromBag[0],
  ofBag instanceof Bag,
  ofBag.createdLength,
  ofBag.length,
  ofBag[1],
);
const fallbackFrom = Array.from.call({}, [5]);
const fallbackOf = Array.of.call({}, 6);
console.log(
  "fallback",
  Array.isArray(fallbackFrom),
  fallbackFrom[0],
  Array.isArray(fallbackOf),
  fallbackOf[0],
);

class ChildArray extends Array {}
const child = new ChildArray(2);
console.log(
  "subclass",
  child instanceof ChildArray,
  child instanceof Array,
  Array.isArray(child),
  child.length,
);

const guarded = Array.of({ marker: 20 });
let turn = 0;
while (turn < 2) {
  console.log("guard", guarded[0].marker);
  if (turn === 0) guarded[0].extra = true;
  turn = turn + 1;
}
`,
  },
];
