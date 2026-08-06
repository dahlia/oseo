import type { Fixture } from "../fixture.ts";

export const iteratorIntrinsicFixtures: readonly Fixture[] = [
  {
    name: "iterator-intrinsic",
    source: `
console.log("metadata", typeof Iterator, Iterator.name, Iterator.length);
const iteratorPrototypeDescriptor = Object.getOwnPropertyDescriptor(
  Iterator,
  "prototype",
);
const fromDescriptor = Object.getOwnPropertyDescriptor(Iterator, "from");
console.log(
  "descriptors",
  iteratorPrototypeDescriptor.writable,
  iteratorPrototypeDescriptor.enumerable,
  iteratorPrototypeDescriptor.configurable,
  fromDescriptor.writable,
  fromDescriptor.enumerable,
  fromDescriptor.configurable,
);
console.log(
  "links",
  Iterator.prototype.constructor === Iterator,
  Iterator.prototype[Symbol.toStringTag],
  Iterator.prototype[Symbol.iterator].call(13),
);
for (const value of [undefined, null, true, 0, 0n, Symbol()]) {
  try { Iterator.from(value); } catch (error) {
    console.log("primitive", error instanceof TypeError);
  }
}
try { Iterator(); } catch (error) {
  console.log("call", error instanceof TypeError);
}
try { new Iterator(); } catch (error) {
  console.log("construct", error instanceof TypeError);
}
class Counter extends Iterator {
  constructor(limit) {
    super();
    this.index = 0;
    this.limit = limit;
  }
  next() {
    const done = this.index === this.limit;
    const value = this.index;
    this.index = this.index + 1;
    return { value, done };
  }
}
const counter = new Counter(2);
console.log(
  "subclass",
  counter instanceof Counter,
  counter instanceof Iterator,
  counter[Symbol.iterator]() === counter,
  counter.next().value,
  counter.next().value,
  counter.next().done,
);

let nextGets = 0;
let nextCalls = 0;
let returnGets = 0;
let returnCalls = 0;
const direct = {
  get next() {
    nextGets = nextGets + 1;
    return function () {
      nextCalls = nextCalls + 1;
      return { value: nextCalls * 3, done: false };
    };
  },
  get return() {
    returnGets = returnGets + 1;
    return function () {
      returnCalls = returnCalls + 1;
      return { value: 9, done: true };
    };
  },
};
const wrapped = Iterator.from(direct);
console.log(
  "wrapper",
  wrapped instanceof Iterator,
  nextGets,
  returnGets,
  wrapped.next().value,
  wrapped.next().value,
  nextCalls,
);
const returned = wrapped.return();
console.log(
  "return",
  returned.value,
  returned.done,
  returnGets,
  returnCalls,
);
const noReturn = Iterator.from({ next() { return { done: true }; } });
const noReturnResult = noReturn.return();
console.log(
  "missing return",
  noReturnResult.value,
  noReturnResult.done,
);
try {
  wrapped.return.call({});
} catch (error) {
  console.log("invalid wrapper", error instanceof TypeError);
}
function* values() { yield 1; }
const generator = values();
console.log("identity", Iterator.from(generator) === generator);

const constructorDescriptor = Object.getOwnPropertyDescriptor(
  Iterator.prototype,
  "constructor",
);
const tagDescriptor = Object.getOwnPropertyDescriptor(
  Iterator.prototype,
  Symbol.toStringTag,
);
console.log(
  "accessors",
  typeof constructorDescriptor.get,
  typeof constructorDescriptor.set,
  constructorDescriptor.enumerable,
  constructorDescriptor.configurable,
  typeof tagDescriptor.get,
  typeof tagDescriptor.set,
  tagDescriptor.enumerable,
  tagDescriptor.configurable,
);
const derivedPrototype = { __proto__: Iterator.prototype };
derivedPrototype.constructor = 17;
derivedPrototype[Symbol.toStringTag] = "Derived";
console.log(
  "setter",
  derivedPrototype.constructor,
  derivedPrototype[Symbol.toStringTag],
  Iterator.prototype.constructor === Iterator,
  Iterator.prototype[Symbol.toStringTag],
);
try { Iterator.prototype.constructor = 0; } catch (error) {
  console.log("home constructor", error instanceof TypeError);
}
try { Iterator.prototype[Symbol.toStringTag] = "changed"; } catch (error) {
  console.log("home tag", error instanceof TypeError);
}

let turn = 0;
while (turn < 2) {
  console.log("guard", Iterator.from === Iterator.from);
  if (turn === 0) Iterator.marker = 1;
  turn = turn + 1;
}
`,
  },
];
