import type { Fixture } from "../fixture.ts";

export const arrayConstructorFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
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
const keyed = {};
Object.defineProperty(keyed, [1, 2], { value: 7 });
const computed = {
  get [["computed"]]() { return 8; },
};
console.log("array key", keyed["1,2"], computed.computed);
for (const invalid of [-1, 1.5]) {
  try { Array(invalid); } catch (error) {
    console.log("invalid", error instanceof RangeError);
  }
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
const fromCodePoints = Array.from("A💩B");
console.log(
  "from code points",
  fromCodePoints.length,
  fromCodePoints[0] === "A",
  fromCodePoints[1] === "💩",
  fromCodePoints[2] === "B",
);
const mapThis = { offset: 10 };
const mapped = Array.from([2, 3], function (value, index) {
  return this.offset + value + index;
}, mapThis);
console.log("mapped", mapped.length, mapped[0], mapped[1]);
try { Array.from([], null); } catch (error) {
  console.log("null mapper", error instanceof TypeError);
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

const stringPrototype = Object.getPrototypeOf(Object(""));
const fromStringWrapper = Array.from(Object("A💩B"));
console.log(
  "from string wrapper",
  fromStringWrapper.length,
  fromStringWrapper[0] === "A",
  fromStringWrapper[1] === "💩",
  fromStringWrapper[2] === "B",
);
for (const iteratorValue of [undefined, null]) {
  Object.defineProperty(Object.prototype, Symbol.iterator, {
    configurable: true,
    value: iteratorValue,
    writable: true,
  });
  const fromInherited = Array.from("A💩B");
  console.log(
    "from inherited iterator",
    iteratorValue === null ? "null" : "undefined",
    fromInherited.length,
    fromInherited[1] === "💩",
  );
}
let inheritedIteratorReads = 0;
Object.defineProperty(Object.prototype, Symbol.iterator, {
  configurable: true,
  get: function () {
    inheritedIteratorReads = inheritedIteratorReads + 1;
    return function () {
      return { next: function () { return { done: true }; } };
    };
  },
});
const fromInheritedAccessor = Array.from("A💩B");
console.log(
  "from inherited accessor",
  fromInheritedAccessor.length,
  fromInheritedAccessor[1] === "💩",
  inheritedIteratorReads,
);
delete Object.prototype[Symbol.iterator];
console.log(
  "delete virtual iterator",
  delete stringPrototype[Symbol.iterator],
);
for (const stringValue of ["A💩B", Object("A💩B")]) {
  const fromDeletedIterator = Array.from(stringValue);
  console.log(
    "from deleted iterator",
    typeof stringValue,
    fromDeletedIterator.length,
    fromDeletedIterator[0] === "A",
    fromDeletedIterator[1] + fromDeletedIterator[2] === "💩",
    fromDeletedIterator[3] === "B",
  );
}
Object.defineProperty(stringPrototype, Symbol.iterator, {
  configurable: true,
  value: function () {
    let done = false;
    return {
      next: function () {
        if (done) return { done: true };
        done = true;
        return { done: false, value: "restored" };
      },
    };
  },
  writable: true,
});
for (const stringValue of ["A💩B", Object("A💩B")]) {
  const fromRedefinedIterator = Array.from(stringValue);
  console.log(
    "from redefined iterator",
    typeof stringValue,
    fromRedefinedIterator.length,
    fromRedefinedIterator[0],
  );
}
console.log(
  "delete redefined iterator",
  delete stringPrototype[Symbol.iterator],
  Array.from("A💩B").length,
  Array.from(Object("A💩B")).length,
);
for (const iteratorValue of [undefined, null]) {
  Object.defineProperty(stringPrototype, Symbol.iterator, {
    configurable: true,
    value: iteratorValue,
    writable: true,
  });
  const fromCodeUnits = Array.from("A💩B");
  console.log(
    "from code units",
    iteratorValue === null ? "null" : "undefined",
    fromCodeUnits.length,
    fromCodeUnits[0] === "A",
    fromCodeUnits[1] + fromCodeUnits[2] === "💩",
    fromCodeUnits[3] === "B",
  );
}
`,
  },
  {
    globalScriptReference: true,
    name: "array-constructor-string-seal-define",
    source: `
const stringPrototype = Object.getPrototypeOf(Object(""));
const emptyIterator = function () {
  return { next: function () { return { done: true }; } };
};
Object.seal(stringPrototype);
Object.defineProperty(stringPrototype, Symbol.iterator, {
  value: emptyIterator,
});
const descriptor = Object.getOwnPropertyDescriptor(
  stringPrototype,
  Symbol.iterator,
);
console.log(
  "sealed iterator definition",
  descriptor.value === emptyIterator,
  descriptor.configurable,
  descriptor.enumerable,
  descriptor.writable,
  delete stringPrototype[Symbol.iterator],
  Array.from("A💩B").length,
  Array.from(Object("A💩B")).length,
);
`,
  },
  {
    globalScriptReference: true,
    name: "array-constructor-string-seal-assignment",
    source: `
const stringPrototype = Object.getPrototypeOf(Object(""));
const emptyIterator = function () {
  return { next: function () { return { done: true }; } };
};
Object.seal(stringPrototype);
stringPrototype[Symbol.iterator] = emptyIterator;
console.log(
  "sealed iterator assignment",
  stringPrototype[Symbol.iterator] === emptyIterator,
  Array.from("A💩B").length,
  Array.from(Object("A💩B")).length,
);
`,
  },
  {
    globalScriptReference: true,
    name: "array-constructor-string-freeze",
    source: `
const stringPrototype = Object.getPrototypeOf(Object(""));
const emptyIterator = function () {
  return { next: function () { return { done: true }; } };
};
Object.freeze(stringPrototype);
let changedValueRejected = false;
try {
  Object.defineProperty(stringPrototype, Symbol.iterator, {
    value: emptyIterator,
  });
} catch (error) {
  changedValueRejected = error instanceof TypeError;
}
let strictAssignmentRejected = false;
try {
  (function () {
    "use strict";
    stringPrototype[Symbol.iterator] = emptyIterator;
  })();
} catch (error) {
  strictAssignmentRejected = error instanceof TypeError;
}
const wrapper = Object("A💩B");
let inheritedAssignmentRejected = false;
try {
  (function () {
    "use strict";
    wrapper[Symbol.iterator] = emptyIterator;
  })();
} catch (error) {
  inheritedAssignmentRejected = error instanceof TypeError;
}
const sameDescriptor = Object.defineProperty(
  stringPrototype,
  Symbol.iterator,
  { configurable: false, enumerable: false, writable: false },
);
console.log(
  "frozen iterator definition",
  changedValueRejected,
  strictAssignmentRejected,
  inheritedAssignmentRejected,
  Object.getOwnPropertyDescriptor(wrapper, Symbol.iterator) === undefined,
  sameDescriptor === stringPrototype,
  Object.isFrozen(stringPrototype),
  delete stringPrototype[Symbol.iterator],
  Array.from("A💩B").length,
  Array.from(Object("A💩B")).length,
);
`,
  },
  {
    globalScriptReference: true,
    name: "array-constructor-string-prevent-extensions",
    source: `
const stringPrototype = Object.getPrototypeOf(Object(""));
Object.preventExtensions(stringPrototype);
console.log(
  "extensible iterator integrity",
  Object.isExtensible(stringPrototype),
  Object.isSealed(stringPrototype),
  Object.isFrozen(stringPrototype),
  delete stringPrototype[Symbol.iterator],
  Array.from("A💩B").length,
);
`,
  },
];
