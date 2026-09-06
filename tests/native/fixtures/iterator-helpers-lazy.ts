import type { Fixture } from "../fixture.ts";

export const iteratorHelpersLazyFixtures: readonly Fixture[] = [
  {
    name: "iterator-helpers-lazy",
    source: `
function* source() {
  yield 1;
  yield 2;
  yield 3;
  yield 4;
}
console.log("map", Array.from(source().map((v, i) => v * 10 + i)).join(","));
console.log(
  "filter",
  Array.from(source().filter((v) => v % 2 === 1)).join(","),
);
console.log("take", Array.from(source().take(2)).join(","));
console.log("take all", Array.from(source().take(9)).join(","));
console.log("take zero", Array.from(source().take(0)).length);
console.log("drop", Array.from(source().drop(2)).join(","));
console.log("drop all", Array.from(source().drop(9)).length);
console.log("drop infinite", source().drop(Infinity).next().done);
const chained = source().map((v) => v * 2).filter((v) => v > 2).take(2);
console.log("chain", Array.from(chained).join(","));
console.log("flatMap", Array.from(source().flatMap((v) => [v, -v])).join(","));

const names = ["map", "filter", "take", "drop", "flatMap"];
for (const name of names) {
  const descriptor = Object.getOwnPropertyDescriptor(Iterator.prototype, name);
  const method = Iterator.prototype[name];
  console.log(
    "descriptor",
    name,
    descriptor.writable,
    descriptor.enumerable,
    descriptor.configurable,
    method.length,
    method.name,
    Object.getPrototypeOf(method) === Function.prototype,
  );
  try { new method(() => 0); } catch (error) {
    console.log("non-constructible", name, error instanceof TypeError);
  }
}

const helper = source().map((v) => v);
const helperPrototype = Object.getPrototypeOf(helper);
const tagDescriptor = Object.getOwnPropertyDescriptor(
  helperPrototype,
  Symbol.toStringTag,
);
console.log(
  "helper shape",
  helper instanceof Iterator,
  Object.getPrototypeOf(helperPrototype) === Iterator.prototype,
  helper[Symbol.iterator]() === helper,
  tagDescriptor.value,
  tagDescriptor.writable,
  tagDescriptor.enumerable,
  tagDescriptor.configurable,
  Object.getPrototypeOf(source().map((v) => v)) === helperPrototype,
);

let closed = 0;
function closable() {
  return {
    __proto__: Iterator.prototype,
    get next() { throw new Error("next must not be read"); },
    return() { closed = closed + 1; return {}; },
  };
}
for (const attempt of [
  () => closable().map(),
  () => closable().map({}),
  () => closable().filter(1),
  () => closable().flatMap(null),
  () => closable().take(),
  () => closable().take(NaN),
  () => closable().take(-1),
  () => closable().drop(-2),
  () => closable().drop("nope"),
  () => closable().take({ get valueOf() { throw new RangeError("valueOf"); } }),
]) {
  closed = 0;
  try {
    attempt();
    console.log("validation missing");
  } catch (error) {
    console.log("validation", error.constructor.name, closed);
  }
}
for (const receiver of [undefined, null, true, 0, 0n, "text", Symbol()]) {
  try { Iterator.prototype.map.call(receiver, (v) => v); } catch (error) {
    console.log("receiver map", error instanceof TypeError);
  }
  try { Iterator.prototype.take.call(receiver, 1); } catch (error) {
    console.log("receiver take", error instanceof TypeError);
  }
}

const mapOrder = [];
try {
  Iterator.prototype.map.call(
    {
      get next() {
        mapOrder.push("get next");
        return function () { return { done: true, value: undefined }; };
      },
    },
    { valueOf() { mapOrder.push("valueOf mapper"); return (v) => v; } },
  );
} catch (error) {
  console.log("map order", error instanceof TypeError, mapOrder.length);
}
const takeOrder = [];
Iterator.prototype.take.call(
  {
    get next() {
      takeOrder.push("get next");
      return function () { return { done: true, value: undefined }; };
    },
  },
  { valueOf() { takeOrder.push("ToNumber limit"); return 0; } },
);
console.log("take order", takeOrder.join(","));
console.log(
  "limit conversion",
  Array.from(source().take({ valueOf() { return 2; } })).join(","),
  Array.from(source().take([1])).join(","),
  Array.from(source().take({ toString() { return "3"; } })).join(","),
  Array.from(source().drop(-0.5)).join(","),
  Array.from(source().take(2.9)).join(","),
);

let nextGets = 0;
let nextCalls = 0;
const counting = {
  __proto__: Iterator.prototype,
  get next() {
    nextGets = nextGets + 1;
    const inner = source();
    return function () {
      nextCalls = nextCalls + 1;
      return inner.next();
    };
  },
};
for (const unused of counting.map((v) => v));
console.log("next capture", nextGets, nextCalls);

class DoneIterator extends Iterator {
  next() { return { done: true, value: undefined }; }
  return() { throw new RangeError("late return"); }
}
const doneHelper = new DoneIterator().map((v) => v);
try { doneHelper.return(); } catch (error) {
  console.log("start return", error.constructor.name);
}
doneHelper.next();
const lateReturn = doneHelper.return();
console.log("late return", lateReturn.value, lateReturn.done);

let returnCount = 0;
class LiveIterator extends Iterator {
  next() { return { done: false, value: 1 }; }
  return() { returnCount = returnCount + 1; return {}; }
}
let taken = new LiveIterator().take(0);
taken.return();
taken.return();
console.log("take return", returnCount);
returnCount = 0;
taken = new LiveIterator().take(1).take(1).take(1);
taken.return();
taken.return();
console.log("nested take return", returnCount);
returnCount = 0;
const suspended = new LiveIterator().map((v) => v);
suspended.next();
const suspendedReturn = suspended.return();
console.log(
  "suspended return",
  returnCount,
  suspendedReturn.value,
  suspendedReturn.done,
  suspended.next().done,
);

let loopCount = 0;
function* endless() {
  while (true) {
    loopCount = loopCount + 1;
    yield loopCount;
  }
}
let enterCount = 0;
const reentrant = endless().map(function () {
  enterCount = enterCount + 1;
  reentrant.next();
});
try { reentrant.next(); } catch (error) {
  console.log(
    "reentrant next",
    error instanceof TypeError,
    loopCount,
    enterCount,
  );
}
const reentrantReturn = endless().map(function () {
  return returnDuringRun.return();
});
const returnDuringRun = reentrantReturn;
try { reentrantReturn.next(); } catch (error) {
  console.log("reentrant return", error instanceof TypeError);
}

class ThrowingNext extends Iterator {
  next() { throw new RangeError("step"); }
  return() { throw new Error("close must not run"); }
}
const throwingHelper = new ThrowingNext().map((v) => v);
try { throwingHelper.next(); } catch (error) {
  console.log("step throw", error.constructor.name);
}
console.log("step throw close", throwingHelper.return().done);

let mapperReturns = 0;
class MapperThrows extends Iterator {
  next() { return { done: false, value: 1 }; }
  return() { mapperReturns = mapperReturns + 1; throw new Error("swallowed"); }
}
try {
  new MapperThrows().map(() => { throw new RangeError("mapper"); }).next();
} catch (error) {
  console.log("mapper throw", error.constructor.name, mapperReturns);
}
class NonObjectResult extends Iterator { next() { return null; } }
try { new NonObjectResult().filter(() => true).next(); } catch (error) {
  console.log("non-object step", error instanceof TypeError);
}
class DoneValueThrows extends Iterator {
  next() { return { done: true, get value() { throw new Error("unread"); } }; }
  return() { throw new Error("unread return"); }
}
const doneValue = new DoneValueThrows().map(() => 0).next();
console.log("done value", doneValue.value, doneValue.done);
let valueReads = 0;
class DropSkipValue extends Iterator {
  next() {
    return {
      done: false,
      get value() { valueReads = valueReads + 1; return valueReads; },
    };
  }
}
const skipped = new DropSkipValue().drop(3).next();
console.log("drop skips value", skipped.value, valueReads);

const flat = [];
try {
  for (const value of source().flatMap(() => "string")) { flat.push(value); }
} catch (error) { flat.push("string " + (error instanceof TypeError)); }
try {
  for (const value of source().flatMap(() => 5)) { flat.push(value); }
} catch (error) { flat.push("number " + (error instanceof TypeError)); }
const fallback = source().flatMap(() => {
  const inner = source();
  return { [Symbol.iterator]: undefined, next: () => inner.next() };
});
flat.push(Array.from(fallback).length);
try {
  source().flatMap(() => ({
    [Symbol.iterator]: 0,
    next: () => ({ done: true }),
  })).next();
} catch (error) { flat.push("uncallable " + (error instanceof TypeError)); }
flat.push(Array.from(source().flatMap((v, i) => [v, i])).join("-"));
console.log("flatMap paths", flat.join("|"));

let innerReturns = 0;
let outerReturns = 0;
const nested = Iterator.prototype.flatMap.call(
  {
    __proto__: Iterator.prototype,
    next() { return { done: false, value: 1 }; },
    return() { outerReturns = outerReturns + 1; return {}; },
  },
  () => ({
    __proto__: Iterator.prototype,
    next() { return { done: false, value: 2 }; },
    return() { innerReturns = innerReturns + 1; return {}; },
  }),
);
console.log("nested first", nested.next().value);
const nestedClose = nested.return();
console.log("nested close", innerReturns, outerReturns, nestedClose.done);

const parallel = source();
const parallelHelper = parallel.map((x) => x);
parallel.next();
parallel.next();
console.log(
  "parallel",
  parallelHelper.next().value,
  parallelHelper.next().value,
  parallelHelper.next().done,
);
const closedEarly = source();
closedEarly.return();
console.log("closed underlying", closedEarly.take(2).next().done);

const filterCounter = [];
Array.from(source().filter((v, i) => {
  filterCounter.push(i);
  return i !== 1;
}));
console.log("filter counter", filterCounter.join(","));

for (const wrongReceiver of [{}, source(), Iterator.prototype]) {
  try { helperPrototype.next.call(wrongReceiver); } catch (error) {
    console.log("helper next receiver", error instanceof TypeError);
  }
  try { helperPrototype.return.call(wrongReceiver); } catch (error) {
    console.log("helper return receiver", error instanceof TypeError);
  }
}

const ordinary = source().map((v) => v);
console.log(
  "ordinary object",
  typeof ordinary,
  Object.prototype.toString.call(ordinary),
  Object.isExtensible(ordinary),
  ordinary instanceof Object,
  Object.prototype.hasOwnProperty.call(ordinary, "next"),
);
ordinary.own = 5;
Object.defineProperty(ordinary, "defined", { value: 7, enumerable: true });
Object.freeze(ordinary);
console.log(
  "ordinary state",
  ordinary.own,
  ordinary.defined,
  Object.isFrozen(ordinary),
  Object.isExtensible(ordinary),
  ordinary.next().value,
);
const consumed = [];
for (const value of source().map((v) => v * 3)) consumed.push(value);
const spread = [...source().filter((v) => v > 2)];
const [firstFlat, ...restFlat] = source().flatMap((v) => [v, v]);
console.log(
  "consumers",
  consumed.join(","),
  spread.join(","),
  firstFlat,
  restFlat.join(","),
);

let turn = 0;
while (turn < 2) {
  console.log("guard", Iterator.prototype.map === Iterator.prototype.map);
  if (turn === 0) Iterator.prototype.marker = 1;
  turn = turn + 1;
}
delete Iterator.prototype.marker;
`,
  },
];
